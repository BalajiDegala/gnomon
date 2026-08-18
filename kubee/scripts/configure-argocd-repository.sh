#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo "ERROR: line $LINENO: $BASH_COMMAND" >&2' ERR

ENV_FILE="${1:-config/lab.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${GITOPS_REPO_URL:?Set GITOPS_REPO_URL in $ENV_FILE}"

if [[ -z "${GITOPS_USERNAME:-}" ]]; then
  read -r -p "GitLab deploy-token username: " GITOPS_USERNAME
fi
if [[ -z "${GITOPS_PASSWORD:-}" ]]; then
  read -r -s -p "GitLab deploy-token password: " GITOPS_PASSWORD
  echo
fi
if [[ -z "$GITOPS_USERNAME" || -z "$GITOPS_PASSWORD" ]]; then
  echo "Both a username and password are required." >&2
  exit 1
fi

repo_url_b64="$(printf %s "$GITOPS_REPO_URL" | base64 -w0)"
username_b64="$(printf %s "$GITOPS_USERNAME" | base64 -w0)"
password_b64="$(printf %s "$GITOPS_PASSWORD" | base64 -w0)"

kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: platform-gitops-repository
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: repository
type: Opaque
data:
  type: Z2l0
  url: ${repo_url_b64}
  username: ${username_b64}
  password: ${password_b64}
EOF

unset GITOPS_PASSWORD password_b64
echo "Configured the private repository $GITOPS_REPO_URL in Argo CD."
