#!/usr/bin/env python3
"""Bootstrap Gnomon's complete lab CI/CD path without printing secrets."""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import getpass
import http.cookiejar
import json
from pathlib import Path
import re
import secrets
import subprocess
import sys
from typing import Any
import urllib.error
import urllib.parse
import urllib.request
import xml.sax.saxutils


REGISTRY_CI_SECRET = "harbor-cicd-registry"
REGISTRY_PULL_SECRET = "harbor-gnomon-registry"
SOURCE_CREDENTIAL = "gitlab-gnomon-read"
GITOPS_CREDENTIAL = "gitlab-gitops-write"
WEBHOOK_CREDENTIAL = "gitlab-gnomon-webhook"
SONAR_CREDENTIAL = "sonarqube-gnomon-token"
RUNTIME_SECRET = "gnomon-runtime"


def run(
    command: list[str], *, input_text: str | None = None, check: bool = True
) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            input=input_text,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=check,
        )
    except subprocess.CalledProcessError as error:
        detail = error.stderr.strip() if error.stderr else "no stderr output"
        raise RuntimeError(
            f"{' '.join(command)} failed with exit status {error.returncode}: {detail}"
        ) from error


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def apply(manifest: dict[str, Any]) -> None:
    run(["kubectl", "apply", "--filename", "-"], input_text=json.dumps(manifest))


def secret_value(namespace: str, name: str, key: str) -> str:
    result = run(
        [
            "kubectl",
            "get",
            "secret",
            name,
            "--namespace",
            namespace,
            "--output",
            f"jsonpath={{.data.{key}}}",
        ]
    )
    value = base64.b64decode(result.stdout.strip(), validate=True).decode("utf-8")
    if not value:
        raise RuntimeError(f"{namespace}/{name} key {key} is empty")
    return value


class HTTP:
    def __init__(
        self,
        base_url: str,
        *,
        basic: tuple[str, str] | None = None,
        token: str | None = None,
        cookies: bool = False,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.basic = basic
        self.token = token
        self.extra_headers: dict[str, str] = {}
        if cookies:
            jar = http.cookiejar.CookieJar()
            self.opener = urllib.request.build_opener(
                urllib.request.HTTPCookieProcessor(jar)
            )
        else:
            self.opener = urllib.request.build_opener()

    def request(
        self,
        method: str,
        path: str,
        *,
        data: Any = None,
        form: bool = False,
        content_type: str | None = None,
        expected: tuple[int, ...] = (200, 201),
    ) -> tuple[int, Any]:
        headers = {
            "Accept": "application/json",
            "User-Agent": "gnomon-cicd-bootstrap/1.0",
            **self.extra_headers,
        }
        if self.basic:
            basic = base64.b64encode(
                f"{self.basic[0]}:{self.basic[1]}".encode("utf-8")
            ).decode("ascii")
            headers["Authorization"] = f"Basic {basic}"
        if self.token:
            headers["PRIVATE-TOKEN"] = self.token

        body: bytes | None = None
        if data is not None:
            if form:
                body = urllib.parse.urlencode(data).encode("utf-8")
                headers["Content-Type"] = "application/x-www-form-urlencoded"
            elif isinstance(data, bytes):
                body = data
                headers["Content-Type"] = content_type or "application/octet-stream"
            else:
                body = json.dumps(data).encode("utf-8")
                headers["Content-Type"] = content_type or "application/json"

        request = urllib.request.Request(
            f"{self.base_url}{path}", data=body, headers=headers, method=method
        )
        try:
            with self.opener.open(request, timeout=90) as response:
                status = response.status
                raw = response.read()
        except urllib.error.HTTPError as error:
            status = error.code
            raw = error.read()
        payload: Any = None
        if raw:
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                payload = raw.decode("utf-8", errors="replace")
        if status not in expected:
            detail = ""
            if isinstance(payload, dict):
                safe = payload.get("message", payload.get("errors", payload.get("error")))
                detail = f": {safe}" if safe else ""
            raise RuntimeError(f"{method} {path} returned HTTP {status}{detail}")
        return status, payload


def toolbox_pod() -> str:
    pod = run(
        [
            "kubectl",
            "get",
            "pod",
            "--namespace",
            "gitlab",
            "--selector",
            "app=toolbox",
            "--field-selector",
            "status.phase=Running",
            "--output",
            "jsonpath={.items[0].metadata.name}",
        ]
    ).stdout.strip()
    if not pod:
        raise RuntimeError("no Running GitLab Toolbox pod found")
    return pod


def rails(pod: str, code: str) -> str:
    return run(
        [
            "kubectl",
            "exec",
            "--stdin",
            "--namespace",
            "gitlab",
            pod,
            "--",
            "gitlab-rails",
            "runner",
            code,
        ]
    ).stdout.strip()


def temporary_gitlab_token(pod: str) -> tuple[int, str]:
    name = f"gnomon-bootstrap-{dt.datetime.now(dt.timezone.utc):%Y%m%d%H%M%S}"
    code = (
        'require "json"; require "securerandom"; '
        'user = User.find_by!(username: "root"); '
        'value = "glpat-" + SecureRandom.urlsafe_base64(32); '
        f"pat = user.personal_access_tokens.new(name: {json.dumps(name)}, "
        'scopes: ["api"], expires_at: Date.current + 1); '
        "pat.set_token(value); pat.save!; "
        "STDOUT.puts(JSON.generate({id: pat.id, token: value}))"
    )
    payload = json.loads(rails(pod, code).splitlines()[-1])
    return int(payload["id"]), str(payload["token"])


def revoke_temporary_gitlab_token(pod: str, token_id: int) -> None:
    rails(
        pod,
        f"pat = PersonalAccessToken.find_by(id: {token_id}); "
        "pat.update!(revoked: true) if pat",
    )


def project(api: HTTP, path: str) -> dict[str, Any]:
    encoded = urllib.parse.quote(path, safe="")
    status, payload = api.request(
        "GET", f"/api/v4/projects/{encoded}", expected=(200, 404)
    )
    if status != 200:
        raise RuntimeError(f"GitLab project {path} does not exist")
    return payload


def project_token(
    api: HTTP, project_id: int, prefix: str, scopes: list[str], access_level: int
) -> tuple[int, str]:
    now = dt.datetime.now(dt.timezone.utc)
    _, payload = api.request(
        "POST",
        f"/api/v4/projects/{project_id}/access_tokens",
        data={
            "name": f"{prefix}{now:%Y%m%d%H%M%S}",
            "scopes": scopes,
            "access_level": access_level,
            "expires_at": (now + dt.timedelta(days=365)).date().isoformat(),
        },
    )
    return int(payload["id"]), str(payload["token"])


def remove_old_tokens(
    api: HTTP, project_id: int, prefix: str, keep_id: int
) -> int:
    _, tokens = api.request(
        "GET", f"/api/v4/projects/{project_id}/access_tokens?state=active"
    )
    removed = 0
    for token in tokens:
        if int(token["id"]) != keep_id and str(token.get("name", "")).startswith(prefix):
            api.request(
                "DELETE",
                f"/api/v4/projects/{project_id}/access_tokens/{token['id']}",
                expected=(204,),
            )
            removed += 1
    return removed


def publish_package_files(
    api: HTTP, project_id: int, repo_root: Path, paths: tuple[str, ...]
) -> tuple[int, str]:
    actions: list[dict[str, str]] = []
    for name in paths:
        local = repo_root / name
        if not local.is_file():
            raise RuntimeError(f"required package file is missing: {name}")
        encoded = urllib.parse.quote(name, safe="")
        status, current = api.request(
            "GET",
            f"/api/v4/projects/{project_id}/repository/files/{encoded}?ref=main",
            expected=(200, 404),
        )
        content = local.read_text(encoding="utf-8")
        if status == 200:
            existing = base64.b64decode(current["content"]).decode("utf-8")
            if existing == content:
                continue
            action = "update"
        else:
            action = "create"
        actions.append({"action": action, "file_path": name, "content": content})
    if not actions:
        _, branch = api.request(
            "GET", f"/api/v4/projects/{project_id}/repository/branches/main"
        )
        return 0, str(branch["commit"]["id"])
    _, commit = api.request(
        "POST",
        f"/api/v4/projects/{project_id}/repository/commits",
        data={
            "branch": "main",
            "commit_message": "ci: configure Gnomon platform delivery",
            "actions": actions,
        },
    )
    return len(actions), str(commit["id"])


def ensure_local_webhooks(api: HTTP) -> None:
    api.request(
        "PUT",
        "/api/v4/application/settings",
        data={"allow_local_requests_from_web_hooks_and_services": True},
    )


def ensure_hook(
    api: HTTP, project_id: int, url: str, webhook_token: str
) -> str:
    _, hooks = api.request("GET", f"/api/v4/projects/{project_id}/hooks")
    data = {
        "url": url,
        "push_events": True,
        "push_events_branch_filter": "main",
        "enable_ssl_verification": False,
        "token": webhook_token,
    }
    existing = next((hook for hook in hooks if hook.get("url") == url), None)
    if existing:
        api.request(
            "PUT", f"/api/v4/projects/{project_id}/hooks/{existing['id']}", data=data
        )
        return "updated"
    api.request("POST", f"/api/v4/projects/{project_id}/hooks", data=data)
    return "created"


def existing_registry_robot(
    registry: str, namespace: str, secret_name: str
) -> tuple[str, str] | None:
    result = run(
        [
            "kubectl",
            "get",
            "secret",
            secret_name,
            "--namespace",
            namespace,
            "--output",
            "jsonpath={.data.\\.dockerconfigjson}",
        ],
        check=False,
    )
    if result.returncode != 0 or not result.stdout.strip():
        return None
    config = json.loads(base64.b64decode(result.stdout.strip()).decode("utf-8"))
    entry = config.get("auths", {}).get(registry)
    if not entry:
        return None
    return str(entry["username"]), str(entry["password"])


def ensure_harbor_project(api: HTTP, name: str) -> bool:
    _, projects = api.request(
        "GET", f"/api/v2.0/projects?name={urllib.parse.quote(name)}"
    )
    if any(item.get("name") == name for item in projects):
        return False
    api.request(
        "POST",
        "/api/v2.0/projects",
        data={"project_name": name, "public": False},
        expected=(201,),
    )
    return True


def create_robot(
    api: HTTP,
    project_name: str,
    prefix: str,
    actions: tuple[str, ...],
    description: str,
) -> tuple[str, str]:
    _, payload = api.request(
        "POST",
        "/api/v2.0/robots",
        data={
            "name": f"{prefix}-{dt.datetime.now(dt.timezone.utc):%Y%m%d%H%M%S}",
            "description": description,
            "duration": 365,
            "disable": False,
            "level": "project",
            "permissions": [
                {
                    "kind": "project",
                    "namespace": project_name,
                    "access": [
                        {"resource": "repository", "action": action}
                        for action in actions
                    ],
                }
            ],
        },
        expected=(201,),
    )
    return str(payload["name"]), str(payload["secret"])


def apply_registry_secret(
    registry: str, username: str, password: str, namespace: str, name: str
) -> None:
    auth = base64.b64encode(f"{username}:{password}".encode()).decode("ascii")
    config = json.dumps(
        {
            "auths": {
                registry: {
                    "username": username,
                    "password": password,
                    "auth": auth,
                }
            }
        },
        separators=(",", ":"),
    )
    apply(
        {
            "apiVersion": "v1",
            "kind": "Secret",
            "metadata": {"name": name, "namespace": namespace},
            "type": "kubernetes.io/dockerconfigjson",
            "stringData": {".dockerconfigjson": config},
        }
    )


class Jenkins:
    def __init__(self, base_url: str, username: str, password: str) -> None:
        self.http = HTTP(base_url, basic=(username, password), cookies=True)
        _, crumb = self.http.request("GET", "/crumbIssuer/api/json")
        self.http.extra_headers[str(crumb["crumbRequestField"])] = str(crumb["crumb"])

    def groovy(self, code: str) -> None:
        self.http.request(
            "POST", "/scriptText", data={"script": code}, form=True, expected=(200,)
        )

    def username_password(
        self, credential_id: str, description: str, username: str, password: str
    ) -> None:
        self.groovy(
            f"""
import jenkins.model.Jenkins
import com.cloudbees.plugins.credentials.CredentialsProvider
import com.cloudbees.plugins.credentials.CredentialsScope
import com.cloudbees.plugins.credentials.SystemCredentialsProvider
import com.cloudbees.plugins.credentials.common.StandardCredentials
import com.cloudbees.plugins.credentials.domains.Domain
import com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl
def store = SystemCredentialsProvider.getInstance().getStore()
def old = CredentialsProvider.lookupCredentials(StandardCredentials.class, Jenkins.get(), null, null).find {{ it.id == {json.dumps(credential_id)} }}
def replacement = new UsernamePasswordCredentialsImpl(CredentialsScope.GLOBAL, {json.dumps(credential_id)}, {json.dumps(description)}, {json.dumps(username)}, {json.dumps(password)})
def ok = old ? store.updateCredentials(Domain.global(), old, replacement) : store.addCredentials(Domain.global(), replacement)
assert ok
"""
        )

    def string(self, credential_id: str, description: str, value: str) -> None:
        self.groovy(
            f"""
import jenkins.model.Jenkins
import hudson.util.Secret
import com.cloudbees.plugins.credentials.CredentialsProvider
import com.cloudbees.plugins.credentials.CredentialsScope
import com.cloudbees.plugins.credentials.SystemCredentialsProvider
import com.cloudbees.plugins.credentials.common.StandardCredentials
import com.cloudbees.plugins.credentials.domains.Domain
import org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl
def store = SystemCredentialsProvider.getInstance().getStore()
def old = CredentialsProvider.lookupCredentials(StandardCredentials.class, Jenkins.get(), null, null).find {{ it.id == {json.dumps(credential_id)} }}
def replacement = new StringCredentialsImpl(CredentialsScope.GLOBAL, {json.dumps(credential_id)}, {json.dumps(description)}, Secret.fromString({json.dumps(value)}))
def ok = old ? store.updateCredentials(Domain.global(), old, replacement) : store.addCredentials(Domain.global(), replacement)
assert ok
"""
        )

    def upsert_job(self, name: str, repository_url: str) -> str:
        escaped_url = xml.sax.saxutils.escape(repository_url)
        config = f"""<?xml version="1.0" encoding="UTF-8"?>
<flow-definition plugin="workflow-job">
  <description>Gnomon test, SonarQube, image, and GitOps delivery.</description>
  <keepDependencies>false</keepDependencies>
  <properties/>
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition" plugin="workflow-cps">
    <scm class="hudson.plugins.git.GitSCM" plugin="git">
      <configVersion>2</configVersion>
      <userRemoteConfigs><hudson.plugins.git.UserRemoteConfig><url>{escaped_url}</url><credentialsId>{SOURCE_CREDENTIAL}</credentialsId></hudson.plugins.git.UserRemoteConfig></userRemoteConfigs>
      <branches><hudson.plugins.git.BranchSpec><name>*/main</name></hudson.plugins.git.BranchSpec></branches>
      <doGenerateSubmoduleConfigurations>false</doGenerateSubmoduleConfigurations>
      <submoduleCfg class="empty-list"/><extensions/>
    </scm>
    <scriptPath>Jenkinsfile</scriptPath><lightweight>true</lightweight>
  </definition>
  <triggers/><disabled>false</disabled>
</flow-definition>
"""
        encoded = urllib.parse.quote(name, safe="")
        status, _ = self.http.request(
            "GET", f"/job/{encoded}/api/json", expected=(200, 404)
        )
        if status == 404:
            self.http.request(
                "POST",
                f"/createItem?name={encoded}",
                data=config.encode(),
                content_type="application/xml",
                expected=(200, 201),
            )
            return "created"
        self.http.request(
            "POST",
            f"/job/{encoded}/config.xml",
            data=config.encode(),
            content_type="application/xml",
            expected=(200,),
        )
        return "updated"

    def trigger(self, name: str) -> None:
        encoded = urllib.parse.quote(name, safe="")
        self.http.request(
            "POST", f"/job/{encoded}/build", expected=(200, 201, 302)
        )


def notes_value(path: Path | None, marker: str) -> str | None:
    if not path or not path.is_file():
        return None
    for line in path.read_text(encoding="utf-8").splitlines():
        if marker.lower() not in line.lower():
            continue
        for separator in (":", "="):
            if separator in line:
                value = line.rsplit(separator, 1)[1].strip().strip("`'").strip('"')
                if value:
                    return value
    return None


def ensure_sonar(values: dict[str, str], notes: Path | None) -> str:
    token = notes_value(notes, "jenkins-ci-token")
    if not token:
        token = getpass.getpass("SonarQube Jenkins analysis token: ").strip()
    if not token:
        raise RuntimeError("a SonarQube analysis token is required")

    token_api = HTTP(f"http://{values['SONAR_HOST']}", basic=(token, ""))
    _, validation = token_api.request("GET", "/api/authentication/validate")
    if not validation.get("valid"):
        raise RuntimeError("the SonarQube analysis token is not valid")

    admin_password = notes_value(notes, "sonarqube --> admin")
    if not admin_password:
        admin_password = getpass.getpass("SonarQube admin password: ").strip()
    admin = HTTP(
        f"http://{values['SONAR_HOST']}", basic=("admin", admin_password)
    )
    _, projects = admin.request(
        "GET",
        f"/api/projects/search?projects={urllib.parse.quote(values['SONAR_PROJECT_KEY'])}",
    )
    created = False
    if not projects.get("components"):
        admin.request(
            "POST",
            "/api/projects/create",
            data={"project": values["SONAR_PROJECT_KEY"], "name": "Gnomon"},
            form=True,
        )
        created = True
    admin_password = ""
    print(f"SonarQube project: {'created' if created else 'existing'}")
    return token


def ensure_storage(values: dict[str, str], repo_root: Path) -> None:
    namespace = values["K8S_NAMESPACE"]
    apply({"apiVersion": "v1", "kind": "Namespace", "metadata": {"name": namespace}})
    path = Path(values["STORAGE_HOST_PATH"])
    if str(path.parent) != "/pipedev/k8s-local" or not re.fullmatch(
        r"[a-z0-9-]+", path.name
    ):
        raise RuntimeError("STORAGE_HOST_PATH must be one safe child of /pipedev/k8s-local")
    job = {
        "apiVersion": "batch/v1",
        "kind": "Job",
        "metadata": {"name": "gnomon-storage-init", "namespace": namespace},
        "spec": {
            "backoffLimit": 2,
            "template": {
                "spec": {
                    "restartPolicy": "Never",
                    "nodeSelector": {"kubernetes.io/hostname": values["STORAGE_NODE"]},
                    "containers": [
                        {
                            "name": "init",
                            "image": "docker.io/library/alpine:3.22",
                            "command": [
                                "/bin/sh",
                                "-c",
                                f"mkdir -p /host/{path.name} && chmod 0755 /host/{path.name}",
                            ],
                            "volumeMounts": [{"name": "host", "mountPath": "/host"}],
                        }
                    ],
                    "volumes": [
                        {
                            "name": "host",
                            "hostPath": {
                                "path": str(path.parent),
                                "type": "DirectoryOrCreate",
                            },
                        }
                    ],
                }
            },
        },
    }
    existing = run(
        ["kubectl", "get", "job", "gnomon-storage-init", "-n", namespace],
        check=False,
    )
    if existing.returncode != 0:
        apply(job)
    run(
        [
            "kubectl",
            "wait",
            "--namespace",
            namespace,
            "--for=condition=complete",
            "job/gnomon-storage-init",
            "--timeout=2m",
        ]
    )
    run(["kubectl", "apply", "--filename", str(repo_root / "deploy/cicd/storage.yaml")])


def ensure_runtime_secret(namespace: str) -> str:
    result = run(
        [
            "kubectl",
            "get",
            "secret",
            RUNTIME_SECRET,
            "-n",
            namespace,
            "-o",
            "json",
        ],
        check=False,
    )
    if result.returncode == 0:
        current = json.loads(result.stdout)
        current_data = current.get("data", {})
        additions = {
            key: value
            for key, value in {
                "ADMIN_EMAIL": "admin@d2-india.com",
                "ADMIN_PASSWORD": secrets.token_urlsafe(24),
                "ADMIN_EMPLOYEE_CODE": "DDI0001",
            }.items()
            if key not in current_data
        }
        if additions:
            apply(
                {
                    "apiVersion": "v1",
                    "kind": "Secret",
                    "metadata": {"name": RUNTIME_SECRET, "namespace": namespace},
                    "type": current.get("type", "Opaque"),
                    "data": current_data,
                    "stringData": additions,
                }
            )
            return "existing runtime secret retained; missing admin keys added"
        return "existing runtime secret retained"
    mongo = secrets.token_hex(24)
    apply(
        {
            "apiVersion": "v1",
            "kind": "Secret",
            "metadata": {"name": RUNTIME_SECRET, "namespace": namespace},
            "type": "Opaque",
            "stringData": {
                "ACCESS_TOKEN_SECRET": secrets.token_hex(32),
                "REFRESH_TOKEN_SECRET": secrets.token_hex(32),
                "MONGO_INITDB_ROOT_PASSWORD": mongo,
                "MONGODB_URI": f"mongodb://gnomonadmin:{mongo}@gnomon-gnomon-mongodb:27017/gnomon?authSource=admin",
                "ADMIN_EMAIL": "admin@d2-india.com",
                "ADMIN_PASSWORD": secrets.token_urlsafe(24),
                "ADMIN_EMPLOYEE_CODE": "DDI0001",
            },
        }
    )
    mongo = ""
    return "created runtime secret"


def apply_argocd_repository(url: str, username: str, password: str) -> None:
    apply(
        {
            "apiVersion": "v1",
            "kind": "Secret",
            "metadata": {
                "name": "gnomon-source-repository",
                "namespace": "argocd",
                "labels": {"argocd.argoproj.io/secret-type": "repository"},
            },
            "type": "Opaque",
            "stringData": {
                "type": "git",
                "url": url,
                "username": username,
                "password": password,
            },
        }
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("env_file", nargs="?", default="deploy/cicd/lab.env")
    parser.add_argument("--secrets-file")
    args = parser.parse_args()
    repo_root = Path(__file__).resolve().parent.parent
    env_path = Path(args.env_file)
    if not env_path.is_absolute():
        env_path = repo_root / env_path
    values = read_env(env_path)
    required = (
        "GITLAB_HOST",
        "GITLAB_PROJECT",
        "GITLAB_REPO_URL",
        "GITOPS_REPO_URL",
        "JENKINS_HOST",
        "JENKINS_JOB",
        "HARBOR_HOST",
        "HARBOR_PROJECT",
        "SONAR_HOST",
        "SONAR_PROJECT_KEY",
        "K8S_NAMESPACE",
        "STORAGE_NODE",
        "STORAGE_HOST_PATH",
    )
    missing = [key for key in required if not values.get(key)]
    if missing:
        raise RuntimeError(f"missing settings: {', '.join(missing)}")
    notes = Path(args.secrets_file).resolve() if args.secrets_file else None

    ensure_storage(values, repo_root)
    runtime_status = ensure_runtime_secret(values["K8S_NAMESPACE"])

    harbor_password = secret_value(
        "harbor", "harbor-admin-password", "HARBOR_ADMIN_PASSWORD"
    )
    harbor = HTTP(
        f"http://{values['HARBOR_HOST']}", basic=("admin", harbor_password)
    )
    harbor_created = ensure_harbor_project(harbor, values["HARBOR_PROJECT"])
    push = existing_registry_robot(values["HARBOR_HOST"], "jenkins", REGISTRY_CI_SECRET)
    if not push:
        push = create_robot(
            harbor,
            values["HARBOR_PROJECT"],
            "jenkins-gnomon",
            ("pull", "push"),
            "Jenkins image publisher",
        )
        push_status = "created Jenkins push/pull robot"
    else:
        push_status = "existing Jenkins push/pull robot retained"
    apply_registry_secret(values["HARBOR_HOST"], push[0], push[1], "jenkins", REGISTRY_CI_SECRET)

    pull = existing_registry_robot(
        values["HARBOR_HOST"], values["K8S_NAMESPACE"], REGISTRY_PULL_SECRET
    )
    if not pull or pull[0] == push[0]:
        pull = create_robot(
            harbor,
            values["HARBOR_PROJECT"],
            "k8s-gnomon",
            ("pull",),
            "Gnomon deployment image pull",
        )
        pull_status = "created deployment pull-only robot"
    else:
        pull_status = "existing deployment pull-only robot retained"
    apply_registry_secret(
        values["HARBOR_HOST"],
        pull[0],
        pull[1],
        values["K8S_NAMESPACE"],
        REGISTRY_PULL_SECRET,
    )
    push = ("", "")
    pull = ("", "")
    harbor_password = ""

    sonar_token = ensure_sonar(values, notes)
    jenkins_password = secret_value(
        "jenkins", "jenkins-admin", "jenkins-admin-password"
    )
    jenkins = Jenkins(
        f"http://{values['JENKINS_HOST']}", "admin", jenkins_password
    )
    jenkins_password = ""

    pod = toolbox_pod()
    temporary_id: int | None = None
    created_tokens: list[tuple[int, int]] = []
    gitlab = HTTP(f"http://{values['GITLAB_HOST']}")
    try:
        temporary_id, admin_token = temporary_gitlab_token(pod)
        gitlab.token = admin_token
        admin_token = ""
        source = project(gitlab, values["GITLAB_PROJECT"])
        gitops_path = urllib.parse.urlparse(values["GITOPS_REPO_URL"]).path.strip("/")
        if gitops_path.endswith(".git"):
            gitops_path = gitops_path[:-4]
        gitops = project(gitlab, gitops_path)

        source_read_id, source_read = project_token(
            gitlab,
            int(source["id"]),
            "gnomon-jenkins-read-",
            ["read_repository"],
            20,
        )
        created_tokens.append((int(source["id"]), source_read_id))
        argo_read_id, argo_read = project_token(
            gitlab,
            int(source["id"]),
            "gnomon-argocd-read-",
            ["read_repository"],
            20,
        )
        created_tokens.append((int(source["id"]), argo_read_id))
        gitops_write_id, gitops_write = project_token(
            gitlab,
            int(gitops["id"]),
            "gnomon-gitops-write-",
            ["write_repository"],
            40,
        )
        created_tokens.append((int(gitops["id"]), gitops_write_id))

        jenkins.username_password(
            SOURCE_CREDENTIAL,
            "Read-only Gnomon source credential",
            "oauth2",
            source_read,
        )
        source_read = ""
        jenkins.username_password(
            GITOPS_CREDENTIAL,
            "Gnomon delivery writer for platform-gitops",
            "oauth2",
            gitops_write,
        )
        gitops_write = ""
        jenkins.string(
            SONAR_CREDENTIAL,
            "Gnomon SonarQube analysis token",
            sonar_token,
        )
        sonar_token = ""
        webhook_token = secrets.token_urlsafe(32)
        jenkins.string(WEBHOOK_CREDENTIAL, "Gnomon GitLab webhook token", webhook_token)
        apply_argocd_repository(values["GITLAB_REPO_URL"], "oauth2", argo_read)
        argo_read = ""

        internal_source = (
            "http://gitlab-webservice-default.gitlab.svc.cluster.local:8181/"
            f"{values['GITLAB_PROJECT']}.git"
        )
        job_status = jenkins.upsert_job(values["JENKINS_JOB"], internal_source)
        published, revision = publish_package_files(
            gitlab,
            int(source["id"]),
            repo_root,
            (
                "Jenkinsfile",
                "deploy/gitops/gnomon-project.yaml",
                "deploy/gitops/gnomon-application.yaml.tpl",
                "deploy/cicd/lab.env",
                "deploy/cicd/storage.yaml",
                "deploy/cicd/Dockerfile.admin-seed",
                "deploy/helm/gnomon/Chart.yaml",
                "deploy/helm/gnomon/values.yaml",
                "deploy/helm/gnomon/templates/_helpers.tpl",
                "deploy/helm/gnomon/templates/admin-seed-job.yaml",
                "deploy/helm/gnomon/templates/api.yaml",
                "deploy/helm/gnomon/templates/ingress.yaml",
                "deploy/helm/gnomon/templates/mongodb.yaml",
                "deploy/helm/gnomon/templates/secret.yaml",
                "deploy/helm/gnomon/templates/web-nginx-config.yaml",
                "deploy/helm/gnomon/templates/web.yaml",
                "scripts/bootstrap-cicd.py",
                "scripts/check-cicd.py",
                "docs/CI_CD_DEPLOYMENT.md",
            ),
        )
        ensure_local_webhooks(gitlab)
        service_ip = run(
            [
                "kubectl",
                "get",
                "service",
                "jenkins",
                "--namespace",
                "jenkins",
                "--output",
                "jsonpath={.spec.clusterIP}",
            ]
        ).stdout.strip()
        hook_status = ensure_hook(
            gitlab,
            int(source["id"]),
            f"http://{service_ip}:8080/project/{values['JENKINS_JOB']}",
            webhook_token,
        )
        webhook_token = ""

        removed = 0
        removed += remove_old_tokens(
            gitlab, int(source["id"]), "gnomon-jenkins-read-", source_read_id
        )
        removed += remove_old_tokens(
            gitlab, int(source["id"]), "gnomon-argocd-read-", argo_read_id
        )
        removed += remove_old_tokens(
            gitlab, int(gitops["id"]), "gnomon-gitops-write-", gitops_write_id
        )
        jenkins.trigger(values["JENKINS_JOB"])

        print(f"Storage: prepared {values['STORAGE_HOST_PATH']} and gnomon-local PV")
        print(f"Runtime credentials: {runtime_status}")
        print(
            f"Harbor project: {values['HARBOR_PROJECT']} "
            f"({'created' if harbor_created else 'existing'})"
        )
        print(f"Harbor CI credential: {push_status}")
        print(f"Harbor deployment credential: {pull_status}")
        print(f"Package files published to GitLab: {published}; revision={revision}")
        print(f"Jenkins job: {values['JENKINS_JOB']} {job_status}")
        print(f"GitLab webhook: {hook_status}")
        print(f"Old Gnomon bootstrap tokens revoked: {removed}")
        print("Initial Gnomon build queued.")
        print("No credential values were printed or written to the package.")
        created_tokens.clear()
    except Exception:
        for project_id, token_id in created_tokens:
            try:
                gitlab.request(
                    "DELETE",
                    f"/api/v4/projects/{project_id}/access_tokens/{token_id}",
                    expected=(204,),
                )
            except Exception:
                pass
        raise
    finally:
        gitlab.token = None
        if temporary_id is not None:
            revoke_temporary_gitlab_token(pod, temporary_id)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
