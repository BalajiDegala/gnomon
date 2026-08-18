#!/usr/bin/env python3
"""Validate a declarative Jenkinsfile against the live Jenkins plugins."""

from __future__ import annotations

import argparse
import base64
import http.cookiejar
import json
from pathlib import Path
import subprocess
import sys
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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("jenkinsfile")
    parser.add_argument("env_file", nargs="?", default="config/lab.env")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    env_path = Path(args.env_file)
    if not env_path.is_absolute():
        env_path = repo_root / env_path
    jenkinsfile = Path(args.jenkinsfile).resolve()
    values = read_env(env_path)

    encoded_password = run(
        [
            "kubectl",
            "get",
            "secret",
            "jenkins-admin",
            "--namespace",
            "jenkins",
            "--output",
            "jsonpath={.data.jenkins-admin-password}",
        ]
    )
    password = base64.b64decode(encoded_password, validate=True).decode("utf-8")
    basic = base64.b64encode(f"admin:{password}".encode()).decode("ascii")
    password = ""
    headers = {"Authorization": f"Basic {basic}"}

    cookies = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))
    base_url = f"http://{values['JENKINS_HOST']}"
    with opener.open(
        urllib.request.Request(
            f"{base_url}/crumbIssuer/api/json", headers=headers
        ),
        timeout=30,
    ) as response:
        crumb = json.loads(response.read())
    headers[str(crumb["crumbRequestField"])] = str(crumb["crumb"])

    body = urllib.parse.urlencode(
        {"jenkinsfile": jenkinsfile.read_text(encoding="utf-8")}
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}/pipeline-model-converter/validate",
        data=body,
        headers={**headers, "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with opener.open(request, timeout=60) as response:
            result = response.read().decode("utf-8", errors="replace").strip()
    except urllib.error.HTTPError as error:
        result = error.read().decode("utf-8", errors="replace").strip()
        print(f"Jenkins validation endpoint returned HTTP {error.code}", file=sys.stderr)
        if result:
            print(result, file=sys.stderr)
        return 1

    print(result)
    if "successfully validated" not in result.lower():
        return 1
    print("No credential values were displayed.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
