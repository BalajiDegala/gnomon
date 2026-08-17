#!/usr/bin/env python3
"""Read-only verification for the package-local Gnomon CI/CD deployment."""

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


def json_request(
    url: str, *, basic: tuple[str, str] | None = None
) -> tuple[int, Any]:
    headers = {"Accept": "application/json", "User-Agent": "gnomon-cicd-check/1.0"}
    if basic:
        value = base64.b64encode(f"{basic[0]}:{basic[1]}".encode()).decode("ascii")
        headers["Authorization"] = f"Basic {value}"
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, None


def host_request(
    ip: str, host: str, path: str, *, data: dict[str, str] | None = None
) -> tuple[int, str]:
    body = json.dumps(data).encode("utf-8") if data is not None else None
    request = urllib.request.Request(
        f"http://{ip}{path}",
        data=body,
        headers={
            "Host": host,
            "User-Agent": "gnomon-cicd-check/1.0",
            **({"Content-Type": "application/json"} if body else {}),
        },
        method="POST" if body else "GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", errors="replace")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("env_file", nargs="?", default="deploy/cicd/lab.env")
    args = parser.parse_args()
    repo_root = Path(__file__).resolve().parent.parent
    env_path = Path(args.env_file)
    if not env_path.is_absolute():
        env_path = repo_root / env_path
    values = read_env(env_path)
    failures: list[str] = []

    app = json.loads(
        run(
            [
                "kubectl",
                "get",
                "application",
                values["ARGOCD_APP"],
                "--namespace",
                "argocd",
                "--output",
                "json",
            ]
        )
    )
    sync = app.get("status", {}).get("sync", {}).get("status")
    health = app.get("status", {}).get("health", {}).get("status")
    revision = str(app["spec"]["source"]["targetRevision"])
    print(f"Argo CD: sync={sync}, health={health}, revision={revision}")
    if sync != "Synced" or health != "Healthy":
        failures.append("Argo CD application is not Synced/Healthy")

    namespace = values["K8S_NAMESPACE"]
    deployments = json.loads(
        run(["kubectl", "get", "deployments", "-n", namespace, "-o", "json"])
    )
    found_components: set[str] = set()
    for deployment in deployments["items"]:
        component = deployment["metadata"].get("labels", {}).get(
            "app.kubernetes.io/component"
        )
        if component not in {"api", "web"}:
            continue
        found_components.add(component)
        desired = int(deployment["spec"].get("replicas", 0))
        ready = int(deployment.get("status", {}).get("readyReplicas", 0))
        image = deployment["spec"]["template"]["spec"]["containers"][0]["image"]
        tag = image.rsplit(":", 1)[-1]
        print(f"Kubernetes {component}: ready={ready}/{desired}, image={image}")
        if ready != desired:
            failures.append(f"{component} deployment does not have all replicas Ready")
        if tag != revision:
            failures.append(f"{component} image tag does not match Argo targetRevision")
    if found_components != {"api", "web"}:
        failures.append("API and web deployments were not both found")

    statefulsets = json.loads(
        run(["kubectl", "get", "statefulsets", "-n", namespace, "-o", "json"])
    )
    mongo = next(
        (
            item
            for item in statefulsets["items"]
            if item["metadata"].get("labels", {}).get("app.kubernetes.io/component")
            == "mongodb"
        ),
        None,
    )
    mongo_ready = int(mongo.get("status", {}).get("readyReplicas", 0)) if mongo else 0
    print(f"MongoDB StatefulSet: ready={mongo_ready}/1")
    if mongo_ready != 1:
        failures.append("MongoDB StatefulSet is not Ready")

    jobs = json.loads(run(["kubectl", "get", "jobs", "-n", namespace, "-o", "json"]))
    seed_jobs = [
        item
        for item in jobs["items"]
        if item["metadata"]["name"].startswith("gnomon-gnomon-admin-seed-")
    ]
    seed_complete = any(int(item.get("status", {}).get("succeeded", 0)) == 1 for item in seed_jobs)
    print(f"Administrator seed Job: complete={seed_complete}")
    if not seed_complete:
        failures.append("administrator seed Job has not completed")

    pv = json.loads(run(["kubectl", "get", "pv", "gnomon-mongodb", "-o", "json"]))
    print(
        f"MongoDB storage: phase={pv['status']['phase']}, "
        f"node={values['STORAGE_NODE']}, path={values['STORAGE_HOST_PATH']}"
    )
    if pv["status"]["phase"] != "Bound":
        failures.append("gnomon-mongodb PV is not Bound")

    jenkins_password = secret(
        "jenkins", "jenkins-admin", "jenkins-admin-password"
    )
    job = urllib.parse.quote(values["JENKINS_JOB"], safe="")
    status, build = json_request(
        f"http://{values['JENKINS_HOST']}/job/{job}/lastCompletedBuild/api/json"
        "?tree=number,result",
        basic=("admin", jenkins_password),
    )
    jenkins_password = ""
    result = build.get("result") if status == 200 and build else None
    number = build.get("number") if status == 200 and build else None
    print(f"Jenkins: last-completed={number}, result={result or 'Unknown'}")
    if result != "SUCCESS":
        failures.append("Jenkins last completed build is not SUCCESS")

    harbor_password = secret(
        "harbor", "harbor-admin-password", "HARBOR_ADMIN_PASSWORD"
    )
    for repository in ("gnomon-api", "gnomon-web", "gnomon-admin-seed"):
        url = (
            f"http://{values['HARBOR_HOST']}/api/v2.0/projects/"
            f"{urllib.parse.quote(values['HARBOR_PROJECT'], safe='')}/repositories/"
            f"{urllib.parse.quote(repository, safe='')}/artifacts?page=1&page_size=100&with_tag=true"
        )
        status, artifacts = json_request(url, basic=("admin", harbor_password))
        tags = {
            tag["name"]
            for artifact in artifacts or []
            for tag in artifact.get("tags") or []
        }
        present = revision in tags
        print(f"Harbor {repository}: deployed-tag-present={present}")
        if status != 200 or not present:
            failures.append(f"Harbor {repository} is missing the deployed tag")
    harbor_password = ""

    status, sonar = json_request(f"http://{values['SONAR_HOST']}/api/system/status")
    sonar_status = sonar.get("status") if status == 200 and sonar else None
    print(f"SonarQube: status={sonar_status or 'Unknown'}")
    if sonar_status != "UP":
        failures.append("SonarQube is not UP")

    web_status, _ = host_request(values["INGRESS_LB_IP"], values["INGRESS_HOST"], "/healthz")
    api_status, _ = host_request(
        values["INGRESS_LB_IP"], values["INGRESS_HOST"], "/api/v1/health/ready"
    )
    print(f"Ingress health: web={web_status}, api={api_status}")
    if web_status != 200 or api_status != 200:
        failures.append("web or API ingress health check did not return HTTP 200")

    runtime_secret = "gnomon-runtime"
    for name in (runtime_secret, "harbor-gnomon-registry"):
        result = run(
            ["kubectl", "get", "secret", name, "-n", namespace, "-o", "name"]
        )
        print(f"Kubernetes Secret: {result}")

    admin_email = secret(namespace, runtime_secret, "ADMIN_EMAIL")
    admin_password = secret(namespace, runtime_secret, "ADMIN_PASSWORD")
    login_status, _ = host_request(
        values["INGRESS_LB_IP"],
        values["INGRESS_HOST"],
        "/api/v1/auth/login",
        data={"email": admin_email, "password": admin_password},
    )
    admin_email = ""
    admin_password = ""
    print(f"Administrator login smoke test: HTTP {login_status}")
    if login_status != 200:
        failures.append("administrator login smoke test did not return HTTP 200")

    if failures:
        print("FAILED:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1
    print("Gnomon CI/CD verification: PASS (no credential values displayed)")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
