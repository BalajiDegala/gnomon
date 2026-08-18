#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo "ERROR: line $LINENO: $BASH_COMMAND" >&2' ERR

ENV_FILE="${1:-config/lab.env}"
REPOSITORY_URL="${2:-}"
SECRET_NAME="${3:-application-source-repository}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

if [[ -z "$REPOSITORY_URL" ]]; then
  echo "Usage: $0 ENV_FILE REPOSITORY_URL [SECRET_NAME]" >&2
  exit 1
fi
if [[ ! "$SECRET_NAME" =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]]; then
  echo "SECRET_NAME must be a valid lowercase Kubernetes resource name." >&2
  exit 1
fi

if [[ -z "${SOURCE_REPO_USERNAME:-}" ]]; then
  read -r -p "GitLab read-only deploy-token username: " SOURCE_REPO_USERNAME
fi
if [[ -z "${SOURCE_REPO_PASSWORD:-}" ]]; then
  read -r -s -p "GitLab read-only deploy-token password: " SOURCE_REPO_PASSWORD
  echo
fi
if [[ -z "$SOURCE_REPO_USERNAME" || -z "$SOURCE_REPO_PASSWORD" ]]; then
  echo "Both a username and password are required." >&2
  exit 1
fi

url_b64="$(printf %s "$REPOSITORY_URL" | base64 -w0)"
username_b64="$(printf %s "$SOURCE_REPO_USERNAME" | base64 -w0)"
password_b64="$(printf %s "$SOURCE_REPO_PASSWORD" | base64 -w0)"

kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: ${SECRET_NAME}
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: repository
type: Opaque
data:
  type: Z2l0
  url: ${url_b64}
  username: ${username_b64}
  password: ${password_b64}
EOF

unset SOURCE_REPO_PASSWORD password_b64
echo "Configured read-only Argo CD access to $REPOSITORY_URL."
