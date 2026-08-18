#!/usr/bin/env python3
"""Read-only, credential-safe health check for the CI/CD demo."""

from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path
import subprocess
import sys
from typing import Any
import urllib.error
import urllib.parse
import urllib.request


def run(command: list[str]) -> str:
    result = subprocess.run(
        command,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    )
    return result.stdout.strip()


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def secret(namespace: str, name: str, key: str) -> str:
    encoded = run(
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
    return base64.b64decode(encoded, validate=True).decode("utf-8")


def request_json(
    url: str, *, basic: tuple[str, str] | None = None
) -> tuple[int, Any]:
    headers = {"Accept": "application/json", "User-Agent": "kubee-cicd-check/1.0"}
    if basic:
        encoded = base64.b64encode(
            f"{basic[0]}:{basic[1]}".encode("utf-8")
        ).decode("ascii")
        headers["Authorization"] = f"Basic {encoded}"
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, None


def application_body(ip: str, host: str) -> str:
    request = urllib.request.Request(
        f"http://{ip}/", headers={"Host": host, "User-Agent": "kubee-cicd-check/1.0"}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status != 200:
            raise RuntimeError(f"application returned HTTP {response.status}")
        return response.read().decode("utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("env_file", nargs="?", default="config/lab.env")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    env_path = Path(args.env_file)
    if not env_path.is_absolute():
        env_path = repo_root / env_path
    values = read_env(env_path)
    failures: list[str] = []

    apps = json.loads(
        run(["kubectl", "get", "applications", "--namespace", "argocd", "-o", "json"])
    )
    app_by_name = {item["metadata"]["name"]: item for item in apps["items"]}
    for name in ("platform-root", "cicd-demo"):
        app = app_by_name.get(name)
        sync = app.get("status", {}).get("sync", {}).get("status") if app else None
        health = app.get("status", {}).get("health", {}).get("status") if app else None
        print(f"Argo CD {name}: sync={sync or 'Missing'}, health={health or 'Missing'}")
        if sync != "Synced" or health != "Healthy":
            failures.append(f"Argo CD application {name} is not Synced/Healthy")

    deployment = json.loads(
        run(
            [
                "kubectl",
                "get",
                "deployment",
                "cicd-demo",
                "--namespace",
                values["CICD_DEMO_NAMESPACE"],
                "-o",
                "json",
            ]
        )
    )
    image = deployment["spec"]["template"]["spec"]["containers"][0]["image"]
    desired = int(deployment["spec"].get("replicas", 0))
    ready = int(deployment.get("status", {}).get("readyReplicas", 0))
    print(f"Kubernetes deployment: ready={ready}/{desired}, image={image}")
    if ready != desired:
        failures.append("Kubernetes deployment does not have all replicas Ready")

    encoded_project = urllib.parse.quote(values["CICD_DEMO_PROJECT"], safe="")
    gitlab_base = f"http://{values['GITLAB_HOST']}"
    status, project = request_json(f"{gitlab_base}/api/v4/projects/{encoded_project}")
    if status != 200:
        failures.append(f"GitLab source project lookup returned HTTP {status}")
        source_sha = "unknown"
        print(f"GitLab source project: HTTP {status}")
    else:
        status, commits = request_json(
            f"{gitlab_base}/api/v4/projects/{project['id']}/repository/commits?per_page=1"
        )
        source_sha = commits[0]["id"] if status == 200 and commits else "unknown"
        print(
            f"GitLab source project: visibility={project['visibility']}, "
            f"branch={project['default_branch']}, commit={source_sha}"
        )
        if source_sha == "unknown":
            failures.append("GitLab latest source commit could not be read")

    deployed_tag = image.rsplit(":", 1)[-1]
    if source_sha != "unknown" and deployed_tag != source_sha:
        failures.append("deployed image tag does not match the latest source commit")

    harbor_password = secret(
        "harbor", "harbor-admin-password", "HARBOR_ADMIN_PASSWORD"
    )
    repository = urllib.parse.quote(values["CICD_HARBOR_REPOSITORY"], safe="")
    artifact_url = (
        f"http://{values['HARBOR_HOST']}/api/v2.0/projects/"
        f"{urllib.parse.quote(values['CICD_HARBOR_PROJECT'], safe='')}/repositories/"
        f"{repository}/artifacts?page=1&page_size=100&with_tag=true"
    )
    status, artifacts = request_json(
        artifact_url, basic=("admin", harbor_password)
    )
    harbor_password = ""
    harbor_tags = {
        tag["name"]
        for artifact in artifacts or []
        for tag in artifact.get("tags") or []
    }
    print(
        f"Harbor artifact: repository={values['CICD_HARBOR_PROJECT']}/"
        f"{values['CICD_HARBOR_REPOSITORY']}, deployed-tag-present={deployed_tag in harbor_tags}"
    )
    if status != 200 or deployed_tag not in harbor_tags:
        failures.append("deployed image tag was not found in Harbor")

    jenkins_password = secret(
        "jenkins", "jenkins-admin", "jenkins-admin-password"
    )
    job = urllib.parse.quote(values["CICD_DEMO_JOB"], safe="")
    status, build = request_json(
        f"http://{values['JENKINS_HOST']}/job/{job}/lastCompletedBuild/api/json"
        "?tree=number,result",
        basic=("admin", jenkins_password),
    )
    jenkins_password = ""
    result = build.get("result") if status == 200 and build else None
    number = build.get("number") if status == 200 and build else None
    print(f"Jenkins last completed build: number={number}, result={result or 'Unknown'}")
    if result != "SUCCESS":
        failures.append("Jenkins last completed build is not SUCCESS")

    body = application_body(values["INGRESS_LB_IP"], values["CICD_DEMO_HOST"])
    endpoint_ok = "CI/CD pipeline is working" in body
    print(f"Application endpoint: http://{values['CICD_DEMO_HOST']}/, expected-page={endpoint_ok}")
    if not endpoint_ok:
        failures.append("application endpoint did not return the expected page")

    for namespace in ("jenkins", values["CICD_DEMO_NAMESPACE"]):
        secret_type = run(
            [
                "kubectl",
                "get",
                "secret",
                "harbor-cicd-registry",
                "--namespace",
                namespace,
                "--output",
                "jsonpath={.type}",
            ]
        )
        print(f"Registry credential {namespace}/harbor-cicd-registry: type={secret_type}")
        if secret_type != "kubernetes.io/dockerconfigjson":
            failures.append(f"registry credential in {namespace} has the wrong type")

    if failures:
        print("FAILED:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1
    print("CI/CD verification: PASS (no credential values displayed)")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
