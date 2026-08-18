#!/usr/bin/env python3
"""Bootstrap the lab CI/CD demo without printing credential values."""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import http.cookiejar
import json
from pathlib import Path
import secrets
import subprocess
import sys
from typing import Any
import urllib.error
import urllib.parse
import urllib.request
import xml.sax.saxutils


GITOPS_CREDENTIAL_ID = "gitlab-gitops-write"
WEBHOOK_CREDENTIAL_ID = "gitlab-cicd-webhook"
REGISTRY_SECRET = "harbor-cicd-registry"
TOKEN_PREFIX = "jenkins-gitops-write-"


def run(
    command: list[str],
    *,
    input_text: str | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        input=input_text,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=check,
    )


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def kube_secret_value(namespace: str, name: str, key: str) -> str:
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


def apply_manifest(manifest: dict[str, Any]) -> None:
    run(["kubectl", "apply", "--filename", "-"], input_text=json.dumps(manifest))


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
            self.cookie_jar: http.cookiejar.CookieJar | None = http.cookiejar.CookieJar()
            self.opener = urllib.request.build_opener(
                urllib.request.HTTPCookieProcessor(self.cookie_jar)
            )
        else:
            self.cookie_jar = None
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
            "User-Agent": "kubee-cicd-bootstrap/1.0",
            **self.extra_headers,
        }
        if self.basic:
            encoded = base64.b64encode(
                f"{self.basic[0]}:{self.basic[1]}".encode("utf-8")
            ).decode("ascii")
            headers["Authorization"] = f"Basic {encoded}"
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
            # Do not include request bodies: they can contain credentials.
            detail = ""
            if isinstance(payload, dict):
                safe = payload.get("message", payload.get("errors", payload.get("error")))
                detail = f": {safe}" if safe else ""
            raise RuntimeError(f"{method} {path} returned HTTP {status}{detail}")
        return status, payload


def toolbox_pod() -> str:
    result = run(
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
    )
    pod = result.stdout.strip()
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
    name = f"kubee-cicd-bootstrap-{dt.datetime.now(dt.timezone.utc):%Y%m%d%H%M%S}"
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


def gitlab_project(api: HTTP, path: str, *, public: bool) -> tuple[int, bool]:
    encoded = urllib.parse.quote(path, safe="")
    status, payload = api.request(
        "GET", f"/api/v4/projects/{encoded}", expected=(200, 404)
    )
    if status == 200:
        desired = "public" if public else "private"
        if payload.get("visibility") != desired:
            api.request(
                "PUT",
                f"/api/v4/projects/{payload['id']}",
                data={"visibility": desired},
            )
        return int(payload["id"]), False

    namespace, project_path = path.rsplit("/", 1)
    if namespace != "root":
        raise RuntimeError("automatic demo creation currently supports root/* only")
    _, payload = api.request(
        "POST",
        "/api/v4/projects",
        data={
            "name": project_path,
            "path": project_path,
            "visibility": "public" if public else "private",
            "initialize_with_readme": False,
        },
    )
    return int(payload["id"]), True


def seed_source(api: HTTP, project_id: int, source_dir: Path) -> tuple[int, int]:
    created = 0
    updated = 0
    for local_path in sorted(path for path in source_dir.rglob("*") if path.is_file()):
        repository_name = local_path.relative_to(source_dir).as_posix()
        encoded_name = urllib.parse.quote(repository_name, safe="")
        status, current = api.request(
            "GET",
            f"/api/v4/projects/{project_id}/repository/files/{encoded_name}?ref=main",
            expected=(200, 404),
        )
        content = local_path.read_text(encoding="utf-8")
        if status == 200:
            existing = base64.b64decode(current["content"]).decode("utf-8")
            if existing == content:
                continue
            method = "PUT"
            updated += 1
        else:
            method = "POST"
            created += 1
        api.request(
            method,
            f"/api/v4/projects/{project_id}/repository/files/{encoded_name}",
            data={
                "branch": "main",
                "content": content,
                "commit_message": f"CI/CD demo: update {repository_name}",
            },
        )
    api.request(
        "PUT", f"/api/v4/projects/{project_id}", data={"default_branch": "main"}
    )
    return created, updated


def create_gitops_token(api: HTTP, project_id: int) -> tuple[int, str]:
    now = dt.datetime.now(dt.timezone.utc)
    name = f"{TOKEN_PREFIX}{now:%Y%m%d%H%M%S}"
    expiry = (now + dt.timedelta(days=365)).date().isoformat()
    _, payload = api.request(
        "POST",
        f"/api/v4/projects/{project_id}/access_tokens",
        data={
            "name": name,
            "scopes": ["write_repository"],
            "access_level": 40,
            "expires_at": expiry,
        },
    )
    return int(payload["id"]), str(payload["token"])


def remove_old_gitops_tokens(api: HTTP, project_id: int, keep_id: int) -> int:
    _, tokens = api.request(
        "GET", f"/api/v4/projects/{project_id}/access_tokens?state=active"
    )
    removed = 0
    for token in tokens:
        if (
            int(token["id"]) != keep_id
            and str(token.get("name", "")).startswith(TOKEN_PREFIX)
        ):
            api.request(
                "DELETE",
                f"/api/v4/projects/{project_id}/access_tokens/{token['id']}",
                expected=(204,),
            )
            removed += 1
    return removed


def ensure_local_webhooks_allowed(api: HTTP) -> None:
    api.request(
        "PUT",
        "/api/v4/application/settings",
        data={"allow_local_requests_from_web_hooks_and_services": True},
    )


def ensure_gitlab_hook(
    api: HTTP, project_id: int, hook_url: str, webhook_token: str
) -> str:
    _, hooks = api.request("GET", f"/api/v4/projects/{project_id}/hooks")
    data = {
        "url": hook_url,
        "push_events": True,
        "push_events_branch_filter": "main",
        "enable_ssl_verification": False,
        "token": webhook_token,
    }
    existing = next((hook for hook in hooks if hook.get("url") == hook_url), None)
    if existing:
        api.request(
            "PUT", f"/api/v4/projects/{project_id}/hooks/{existing['id']}", data=data
        )
        return "updated"
    api.request("POST", f"/api/v4/projects/{project_id}/hooks", data=data)
    return "created"


def harbor_existing_robot(host: str, namespace: str) -> tuple[str, str] | None:
    result = run(
        [
            "kubectl",
            "get",
            "secret",
            REGISTRY_SECRET,
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
    entry = config.get("auths", {}).get(host)
    if not entry:
        return None
    return str(entry["username"]), str(entry["password"])


def ensure_harbor_project(api: HTTP, name: str) -> bool:
    _, projects = api.request(
        "GET", f"/api/v2.0/projects?name={urllib.parse.quote(name)}"
    )
    if any(project.get("name") == name for project in projects):
        return False
    api.request(
        "POST",
        "/api/v2.0/projects",
        data={"project_name": name, "public": False},
        expected=(201,),
    )
    return True


def create_harbor_robot(
    api: HTTP,
    project: str,
    name_prefix: str,
    actions: tuple[str, ...],
    description: str,
) -> tuple[str, str]:
    name = f"{name_prefix}-{dt.datetime.now(dt.timezone.utc):%Y%m%d%H%M%S}"
    _, payload = api.request(
        "POST",
        "/api/v2.0/robots",
        data={
            "name": name,
            "description": description,
            "duration": 365,
            "disable": False,
            "level": "project",
            "permissions": [
                {
                    "kind": "project",
                    "namespace": project,
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
    host: str, username: str, password: str, namespace: str
) -> None:
    auth = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
    docker_config = json.dumps(
        {
            "auths": {
                host: {
                    "username": username,
                    "password": password,
                    "auth": auth,
                }
            }
        },
        separators=(",", ":"),
    )
    namespace_manifest = run(
        ["kubectl", "create", "namespace", namespace, "--dry-run=client", "-o", "json"]
    )
    apply_manifest(json.loads(namespace_manifest.stdout))
    apply_manifest(
        {
            "apiVersion": "v1",
            "kind": "Secret",
            "metadata": {"name": REGISTRY_SECRET, "namespace": namespace},
            "type": "kubernetes.io/dockerconfigjson",
            "stringData": {".dockerconfigjson": docker_config},
        }
    )


class Jenkins:
    def __init__(self, base_url: str, username: str, password: str) -> None:
        self.http = HTTP(base_url, basic=(username, password), cookies=True)
        _, crumb = self.http.request("GET", "/crumbIssuer/api/json")
        self.http.extra_headers[str(crumb["crumbRequestField"])] = str(crumb["crumb"])

    def groovy(self, code: str) -> None:
        self.http.request(
            "POST",
            "/scriptText",
            data={"script": code},
            form=True,
            expected=(200,),
        )

    def upsert_username_password(
        self, credential_id: str, description: str, username: str, password: str
    ) -> None:
        code = f"""
import jenkins.model.Jenkins
import com.cloudbees.plugins.credentials.CredentialsProvider
import com.cloudbees.plugins.credentials.CredentialsScope
import com.cloudbees.plugins.credentials.SystemCredentialsProvider
import com.cloudbees.plugins.credentials.common.StandardCredentials
import com.cloudbees.plugins.credentials.domains.Domain
import com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl
def store = SystemCredentialsProvider.getInstance().getStore()
def old = CredentialsProvider.lookupCredentials(
  StandardCredentials.class, Jenkins.get(), null, null
).find {{ it.id == {json.dumps(credential_id)} }}
def replacement = new UsernamePasswordCredentialsImpl(
  CredentialsScope.GLOBAL,
  {json.dumps(credential_id)},
  {json.dumps(description)},
  {json.dumps(username)},
  {json.dumps(password)}
)
def ok = old ? store.updateCredentials(Domain.global(), old, replacement)
             : store.addCredentials(Domain.global(), replacement)
assert ok
println("CREDENTIAL_OK")
"""
        self.groovy(code)

    def upsert_string(
        self, credential_id: str, description: str, value: str
    ) -> None:
        code = f"""
import jenkins.model.Jenkins
import hudson.util.Secret
import com.cloudbees.plugins.credentials.CredentialsProvider
import com.cloudbees.plugins.credentials.CredentialsScope
import com.cloudbees.plugins.credentials.SystemCredentialsProvider
import com.cloudbees.plugins.credentials.common.StandardCredentials
import com.cloudbees.plugins.credentials.domains.Domain
import org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl
def store = SystemCredentialsProvider.getInstance().getStore()
def old = CredentialsProvider.lookupCredentials(
  StandardCredentials.class, Jenkins.get(), null, null
).find {{ it.id == {json.dumps(credential_id)} }}
def replacement = new StringCredentialsImpl(
  CredentialsScope.GLOBAL,
  {json.dumps(credential_id)},
  {json.dumps(description)},
  Secret.fromString({json.dumps(value)})
)
def ok = old ? store.updateCredentials(Domain.global(), old, replacement)
             : store.addCredentials(Domain.global(), replacement)
assert ok
println("CREDENTIAL_OK")
"""
        self.groovy(code)

    def upsert_job(self, name: str, repository_url: str) -> str:
        escaped_url = xml.sax.saxutils.escape(repository_url)
        config = f"""<?xml version="1.0" encoding="UTF-8"?>
<flow-definition plugin="workflow-job">
  <description>End-to-end GitLab, Jenkins, Harbor, and Argo CD demo.</description>
  <keepDependencies>false</keepDependencies>
  <properties/>
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition" plugin="workflow-cps">
    <scm class="hudson.plugins.git.GitSCM" plugin="git">
      <configVersion>2</configVersion>
      <userRemoteConfigs>
        <hudson.plugins.git.UserRemoteConfig>
          <url>{escaped_url}</url>
        </hudson.plugins.git.UserRemoteConfig>
      </userRemoteConfigs>
      <branches>
        <hudson.plugins.git.BranchSpec>
          <name>*/main</name>
        </hudson.plugins.git.BranchSpec>
      </branches>
      <doGenerateSubmoduleConfigurations>false</doGenerateSubmoduleConfigurations>
      <submoduleCfg class="empty-list"/>
      <extensions/>
    </scm>
    <scriptPath>Jenkinsfile</scriptPath>
    <lightweight>true</lightweight>
  </definition>
  <triggers/>
  <disabled>false</disabled>
</flow-definition>
"""
        encoded_name = urllib.parse.quote(name, safe="")
        status, _ = self.http.request(
            "GET", f"/job/{encoded_name}/api/json", expected=(200, 404)
        )
        if status == 404:
            self.http.request(
                "POST",
                f"/createItem?name={encoded_name}",
                data=config.encode("utf-8"),
                content_type="application/xml",
                expected=(200, 201),
            )
            return "created"
        self.http.request(
            "POST",
            f"/job/{encoded_name}/config.xml",
            data=config.encode("utf-8"),
            content_type="application/xml",
            expected=(200,),
        )
        return "updated"

    def trigger(self, name: str) -> None:
        encoded_name = urllib.parse.quote(name, safe="")
        self.http.request(
            "POST", f"/job/{encoded_name}/build", expected=(200, 201, 302)
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("env_file", nargs="?", default="config/lab.env")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    env_path = Path(args.env_file)
    if not env_path.is_absolute():
        env_path = repo_root / env_path
    values = read_env(env_path)
    required = (
        "GITLAB_HOST",
        "HARBOR_HOST",
        "JENKINS_HOST",
        "GITOPS_REPO_URL",
        "CICD_DEMO_PROJECT",
        "CICD_DEMO_JOB",
        "CICD_DEMO_NAMESPACE",
        "CICD_HARBOR_PROJECT",
    )
    missing = [key for key in required if not values.get(key)]
    if missing:
        raise RuntimeError(f"missing settings in {env_path}: {', '.join(missing)}")

    harbor_password = kube_secret_value(
        "harbor", "harbor-admin-password", "HARBOR_ADMIN_PASSWORD"
    )
    jenkins_password = kube_secret_value(
        "jenkins", "jenkins-admin", "jenkins-admin-password"
    )
    harbor = HTTP(
        f"http://{values['HARBOR_HOST']}", basic=("admin", harbor_password)
    )
    jenkins = Jenkins(
        f"http://{values['JENKINS_HOST']}", "admin", jenkins_password
    )
    harbor_password = ""
    jenkins_password = ""

    harbor_created = ensure_harbor_project(harbor, values["CICD_HARBOR_PROJECT"])
    push_robot = harbor_existing_robot(values["HARBOR_HOST"], "jenkins")
    if push_robot:
        push_robot_status = "existing Jenkins push/pull robot retained"
        push_username, push_password = push_robot
    else:
        push_username, push_password = create_harbor_robot(
            harbor,
            values["CICD_HARBOR_PROJECT"],
            "jenkins-cicd",
            ("pull", "push"),
            "Jenkins image push credential for cicd-demo",
        )
        push_robot_status = "created Jenkins push/pull robot"
    apply_registry_secret(
        values["HARBOR_HOST"],
        push_username,
        push_password,
        "jenkins",
    )

    pull_robot = harbor_existing_robot(
        values["HARBOR_HOST"], values["CICD_DEMO_NAMESPACE"]
    )
    if pull_robot and pull_robot[0] != push_username:
        pull_robot_status = "existing deployment pull-only robot retained"
        pull_username, pull_password = pull_robot
    else:
        pull_username, pull_password = create_harbor_robot(
            harbor,
            values["CICD_HARBOR_PROJECT"],
            "k8s-cicd-demo",
            ("pull",),
            "Kubernetes pull-only credential for cicd-demo",
        )
        pull_robot_status = "created deployment pull-only robot"
    apply_registry_secret(
        values["HARBOR_HOST"],
        pull_username,
        pull_password,
        values["CICD_DEMO_NAMESPACE"],
    )
    push_username = ""
    push_password = ""
    pull_username = ""
    pull_password = ""

    pod = toolbox_pod()
    temporary_id: int | None = None
    gitops_token_id: int | None = None
    gitlab = HTTP(f"http://{values['GITLAB_HOST']}")
    try:
        temporary_id, admin_token = temporary_gitlab_token(pod)
        gitlab.token = admin_token
        admin_token = ""

        demo_id, demo_created = gitlab_project(
            gitlab, values["CICD_DEMO_PROJECT"], public=True
        )
        gitops_path = urllib.parse.urlparse(values["GITOPS_REPO_URL"]).path
        if gitops_path.endswith(".git"):
            gitops_path = gitops_path[:-4]
        gitops_id, _ = gitlab_project(
            gitlab, gitops_path.strip("/"), public=False
        )

        gitops_token_id, gitops_token = create_gitops_token(gitlab, gitops_id)
        webhook_token = secrets.token_urlsafe(32)
        jenkins.upsert_username_password(
            GITOPS_CREDENTIAL_ID,
            "Write-only delivery credential for root/platform-gitops",
            "oauth2",
            gitops_token,
        )
        gitops_token = ""
        jenkins.upsert_string(
            WEBHOOK_CREDENTIAL_ID,
            "GitLab webhook token for cicd-demo",
            webhook_token,
        )

        internal_source_url = (
            "http://gitlab-webservice-default.gitlab.svc.cluster.local:8181/"
            f"{values['CICD_DEMO_PROJECT']}.git"
        )
        job_status = jenkins.upsert_job(values["CICD_DEMO_JOB"], internal_source_url)

        # The job update clears any old trigger before source changes are
        # published. The explicit build below then configures one current
        # trigger and avoids duplicate webhook/manual builds on reruns.
        created_files, updated_files = seed_source(
            gitlab, demo_id, repo_root / "demo-app"
        )

        ensure_local_webhooks_allowed(gitlab)
        jenkins_service_ip = run(
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
        hook_status = ensure_gitlab_hook(
            gitlab,
            demo_id,
            f"http://{jenkins_service_ip}:8080/project/{values['CICD_DEMO_JOB']}",
            webhook_token,
        )
        webhook_token = ""

        old_tokens_removed = remove_old_gitops_tokens(
            gitlab, gitops_id, gitops_token_id
        )
        jenkins.trigger(values["CICD_DEMO_JOB"])

        print(
            f"GitLab source project: {values['CICD_DEMO_PROJECT']} "
            f"({'created' if demo_created else 'existing'})"
        )
        print(f"Source files: {created_files} created, {updated_files} updated")
        print(
            f"Harbor project: {values['CICD_HARBOR_PROJECT']} "
            f"({'created' if harbor_created else 'existing'})"
        )
        print(f"Harbor CI credential: {push_robot_status}")
        print(f"Harbor deployment credential: {pull_robot_status}")
        print(f"Jenkins job: {values['CICD_DEMO_JOB']} {job_status}")
        print(f"GitLab webhook: {hook_status}")
        print(f"Old bootstrap GitOps tokens revoked: {old_tokens_removed}")
        print("Initial Jenkins build queued.")
        print("No credential values were printed or written to the workspace.")
    except Exception:
        if gitops_token_id is not None:
            try:
                gitops_path = urllib.parse.urlparse(values["GITOPS_REPO_URL"]).path
                if gitops_path.endswith(".git"):
                    gitops_path = gitops_path[:-4]
                encoded = urllib.parse.quote(gitops_path.strip("/"), safe="")
                status, project = gitlab.request(
                    "GET", f"/api/v4/projects/{encoded}", expected=(200, 404)
                )
                if status == 200:
                    gitlab.request(
                        "DELETE",
                        f"/api/v4/projects/{project['id']}/access_tokens/{gitops_token_id}",
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
