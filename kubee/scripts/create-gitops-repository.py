#!/usr/bin/env python3
"""Create and seed the lab GitOps project without printing credentials."""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
from pathlib import Path
import socket
import subprocess
import sys
import time
from typing import Any
import urllib.error
import urllib.parse
import urllib.request


REPOSITORY_SECRET = "platform-gitops-repository"
DEPLOY_TOKEN_PREFIX = "argocd-read-repository"


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key.strip()] = value.strip().strip("\"").strip("'")
    return values


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


def wait_for_port_forward(process: subprocess.Popen[str], port: int) -> None:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if process.poll() is not None:
            detail = process.stderr.read().strip() if process.stderr else ""
            raise RuntimeError(f"kubectl port-forward exited early: {detail}")
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return
        except OSError:
            time.sleep(0.25)
    raise RuntimeError("timed out waiting for the local GitLab API tunnel")


class GitLabAPI:
    def __init__(self, local_port: int, host: str) -> None:
        self.base_url = f"http://127.0.0.1:{local_port}"
        self.host = host
        self.token: str | None = None

    def request(
        self,
        method: str,
        path: str,
        *,
        data: dict[str, Any] | None = None,
        form: bool = False,
        authenticated: bool = True,
        expected: tuple[int, ...] = (200, 201),
    ) -> tuple[int, Any]:
        headers = {
            "Accept": "application/json",
            "Host": self.host,
            "User-Agent": "kubee-gitops-bootstrap/1.0",
        }
        body: bytes | None = None
        if data is not None:
            if form:
                body = urllib.parse.urlencode(data).encode("utf-8")
                headers["Content-Type"] = "application/x-www-form-urlencoded"
            else:
                body = json.dumps(data).encode("utf-8")
                headers["Content-Type"] = "application/json"
        if authenticated:
            if not self.token:
                raise RuntimeError("GitLab API authentication is not established")
            headers["PRIVATE-TOKEN"] = self.token

        request = urllib.request.Request(
            f"{self.base_url}{path}", data=body, headers=headers, method=method
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
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
            detail = payload
            if isinstance(payload, dict):
                detail = payload.get("message", payload.get("error_description", payload))
            raise RuntimeError(f"GitLab API {method} {path} returned HTTP {status}: {detail}")
        return status, payload

def repository_path(repo_url: str) -> tuple[str, str]:
    parsed = urllib.parse.urlparse(repo_url)
    path = parsed.path.strip("/")
    if path.endswith(".git"):
        path = path[:-4]
    if not parsed.hostname or "/" not in path:
        raise ValueError(f"GITOPS_REPO_URL is not a namespaced Git URL: {repo_url}")
    return parsed.hostname, path


def ensure_project(api: GitLabAPI, path_with_namespace: str) -> tuple[int, bool]:
    encoded_path = urllib.parse.quote(path_with_namespace, safe="")
    status, payload = api.request(
        "GET", f"/api/v4/projects/{encoded_path}", expected=(200, 404)
    )
    if status == 200:
        if payload["path_with_namespace"] != path_with_namespace:
            raise RuntimeError("GitLab returned a different project than requested")
        return int(payload["id"]), False

    namespace, project_path = path_with_namespace.rsplit("/", 1)
    if namespace != "root":
        raise RuntimeError(
            "automatic project creation currently supports the root namespace only; "
            "create the requested group project in GitLab first"
        )
    _, payload = api.request(
        "POST",
        "/api/v4/projects",
        data={
            "name": project_path,
            "path": project_path,
            "visibility": "private",
            "initialize_with_readme": False,
        },
    )
    if payload["path_with_namespace"] != path_with_namespace:
        raise RuntimeError("GitLab created the project in an unexpected namespace")
    return int(payload["id"]), True


def ensure_seed_files(api: GitLabAPI, project_id: int, repo_root: Path) -> int:
    seed_files = (
        ("README.md", repo_root / "gitops" / "README.md"),
        (
            "clusters/lab/apps/README.md",
            repo_root / "gitops" / "clusters" / "lab" / "apps" / "README.md",
        ),
    )
    created = 0
    for repository_name, local_path in seed_files:
        encoded_name = urllib.parse.quote(repository_name, safe="")
        status, _ = api.request(
            "GET",
            f"/api/v4/projects/{project_id}/repository/files/{encoded_name}?ref=main",
            expected=(200, 404),
        )
        if status == 200:
            continue
        api.request(
            "POST",
            f"/api/v4/projects/{project_id}/repository/files/{encoded_name}",
            data={
                "branch": "main",
                "content": local_path.read_text(encoding="utf-8"),
                "commit_message": f"Add {repository_name}",
            },
        )
        created += 1
    return created


def existing_repository_secret_url() -> str | None:
    result = run(
        [
            "kubectl",
            "get",
            "secret",
            REPOSITORY_SECRET,
            "--namespace",
            "argocd",
            "--output",
            "jsonpath={.data.url}",
        ],
        check=False,
    )
    if result.returncode != 0:
        return None
    return base64.b64decode(result.stdout.strip(), validate=True).decode("utf-8")


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
        raise RuntimeError("no Running GitLab toolbox pod was found")
    return pod


def run_gitlab_rails(pod: str, code: str) -> str:
    result = run(
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
    )
    return result.stdout.strip()


def create_temporary_admin_token(pod: str) -> tuple[int, str]:
    name = f"kubee-gitops-bootstrap-{dt.datetime.now(dt.timezone.utc):%Y%m%d%H%M%S}"
    code = (
        'require "json"; require "securerandom"; '
        'user = User.find_by!(username: "root"); '
        'value = "glpat-" + SecureRandom.urlsafe_base64(32); '
        f'pat = user.personal_access_tokens.new(name: {json.dumps(name)}, '
        'scopes: ["api"], expires_at: Date.current + 1); '
        'pat.set_token(value); pat.save!; '
        'STDOUT.puts(JSON.generate({id: pat.id, token: value}))'
    )
    raw = run_gitlab_rails(pod, code)
    payload = json.loads(raw.splitlines()[-1])
    return int(payload["id"]), str(payload["token"])


def revoke_temporary_admin_token(pod: str, token_id: int) -> None:
    code = (
        f"pat = PersonalAccessToken.find_by(id: {token_id}); "
        "pat.update!(revoked: true) if pat"
    )
    run_gitlab_rails(pod, code)


def apply_repository_secret(repo_url: str, username: str, password: str) -> None:
    manifest = {
        "apiVersion": "v1",
        "kind": "Secret",
        "metadata": {
            "name": REPOSITORY_SECRET,
            "namespace": "argocd",
            "labels": {"argocd.argoproj.io/secret-type": "repository"},
        },
        "type": "Opaque",
        "stringData": {
            "type": "git",
            "url": repo_url,
            "username": username,
            "password": password,
        },
    }
    run(["kubectl", "apply", "--filename", "-"], input_text=json.dumps(manifest))


def ensure_deploy_token(api: GitLabAPI, project_id: int, repo_url: str) -> str:
    existing_url = existing_repository_secret_url()
    if existing_url:
        if existing_url != repo_url:
            raise RuntimeError(
                f"{REPOSITORY_SECRET} already points to a different repository"
            )
        return "existing Kubernetes repository Secret retained"

    now = dt.datetime.now(dt.timezone.utc)
    name = f"{DEPLOY_TOKEN_PREFIX}-{now:%Y%m%d%H%M%S}"
    expiry = (now + dt.timedelta(days=365)).date().isoformat()
    _, payload = api.request(
        "POST",
        f"/api/v4/projects/{project_id}/deploy_tokens",
        data={"name": name, "expires_at": expiry, "scopes": ["read_repository"]},
    )
    token_id = int(payload["id"])
    try:
        apply_repository_secret(repo_url, payload["username"], payload["token"])
    except Exception:
        api.request(
            "DELETE",
            f"/api/v4/projects/{project_id}/deploy_tokens/{token_id}",
            expected=(204,),
        )
        raise
    return f"created read-only deploy token {name}, expiring {expiry}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("env_file", nargs="?", default="config/lab.env")
    parser.add_argument("--local-port", type=int, default=18081)
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    env_path = Path(args.env_file)
    if not env_path.is_absolute():
        env_path = repo_root / env_path
    if not env_path.is_file():
        raise FileNotFoundError(f"missing env file: {env_path}")

    values = read_env(env_path)
    repo_url = values.get("GITOPS_REPO_URL", "")
    if not repo_url:
        raise RuntimeError(f"set GITOPS_REPO_URL in {env_path}")
    gitlab_host, path_with_namespace = repository_path(repo_url)

    port_forward = subprocess.Popen(
        [
            "kubectl",
            "port-forward",
            "--address",
            "127.0.0.1",
            "--namespace",
            "gitlab",
            "service/gitlab-webservice-default",
            f"{args.local_port}:8181",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    api = GitLabAPI(args.local_port, gitlab_host)
    gitlab_toolbox: str | None = None
    temporary_token_id: int | None = None
    try:
        wait_for_port_forward(port_forward, args.local_port)
        gitlab_toolbox = toolbox_pod()
        temporary_token_id, temporary_token = create_temporary_admin_token(
            gitlab_toolbox
        )
        try:
            api.token = temporary_token
        finally:
            temporary_token = ""

        _, current_user = api.request("GET", "/api/v4/user")
        if current_user.get("username") != "root" or not current_user.get("is_admin"):
            raise RuntimeError("the temporary GitLab session is not an administrator")

        project_id, project_created = ensure_project(api, path_with_namespace)
        files_created = ensure_seed_files(api, project_id, repo_root)
        token_result = ensure_deploy_token(api, project_id, repo_url)

        print(f"GitLab project: {repo_url}")
        print("Project status: " + ("created" if project_created else "already existed"))
        print(f"Seed files created: {files_created}")
        print(f"Repository credential: {token_result}")
        print("No credential values were printed or written to the workspace.")
    finally:
        try:
            api.token = None
            if gitlab_toolbox and temporary_token_id is not None:
                revoke_temporary_admin_token(gitlab_toolbox, temporary_token_id)
        finally:
            port_forward.terminate()
            try:
                port_forward.wait(timeout=10)
            except subprocess.TimeoutExpired:
                port_forward.kill()
                port_forward.wait(timeout=5)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
