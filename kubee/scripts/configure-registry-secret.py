#!/usr/bin/env python3
"""Interactively apply a Docker registry Secret without printing its values."""

from __future__ import annotations

import argparse
import base64
import getpass
import json
import re
import subprocess
import sys


RESOURCE_NAME = re.compile(r"^[a-z0-9]([-a-z0-9]*[a-z0-9])?$")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("namespace")
    parser.add_argument("secret_name")
    parser.add_argument("registry_host")
    args = parser.parse_args()

    if not RESOURCE_NAME.fullmatch(args.namespace):
        raise ValueError("namespace is not a valid lowercase Kubernetes name")
    if not RESOURCE_NAME.fullmatch(args.secret_name):
        raise ValueError("secret_name is not a valid lowercase Kubernetes name")
    if "://" in args.registry_host or "/" in args.registry_host:
        raise ValueError("registry_host must be a hostname, without a URL scheme or path")

    username = input("Registry robot username: ").strip()
    password = getpass.getpass("Registry robot secret: ")
    if not username or not password:
        raise ValueError("both a robot username and secret are required")

    auth = base64.b64encode(f"{username}:{password}".encode()).decode("ascii")
    docker_config = json.dumps(
        {
            "auths": {
                args.registry_host: {
                    "username": username,
                    "password": password,
                    "auth": auth,
                }
            }
        },
        separators=(",", ":"),
    )
    manifest = {
        "apiVersion": "v1",
        "kind": "Secret",
        "metadata": {"name": args.secret_name, "namespace": args.namespace},
        "type": "kubernetes.io/dockerconfigjson",
        "stringData": {".dockerconfigjson": docker_config},
    }
    subprocess.run(
        ["kubectl", "apply", "--filename", "-"],
        input=json.dumps(manifest),
        text=True,
        check=True,
    )
    username = ""
    password = ""
    docker_config = ""
    print(
        f"Configured {args.namespace}/{args.secret_name} for "
        f"{args.registry_host}; no credential values were displayed."
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
