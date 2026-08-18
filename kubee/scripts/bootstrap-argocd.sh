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
: "${GITOPS_REPO_REVISION:?Set GITOPS_REPO_REVISION in $ENV_FILE}"
: "${GITOPS_REPO_PATH:?Set GITOPS_REPO_PATH in $ENV_FILE}"
: "${GITOPS_PROJECT:?Set GITOPS_PROJECT in $ENV_FILE}"
: "${GITOPS_APP_NAMESPACE:?Set GITOPS_APP_NAMESPACE in $ENV_FILE}"

if ! kubectl get secret platform-gitops-repository --namespace argocd >/dev/null; then
  echo "Repository Secret is missing. Run scripts/configure-argocd-repository.sh first." >&2
  exit 1
fi

project_manifest="$(mktemp)"
application_manifest="$(mktemp)"
trap 'rm -f "$project_manifest" "$application_manifest"' EXIT

envsubst < manifests/argocd/platform-project.yaml.tpl > "$project_manifest"
envsubst < manifests/argocd/root-application.yaml.tpl > "$application_manifest"

kubectl apply -f "$project_manifest"
kubectl apply -f "$application_manifest"

echo "Bootstrapped Argo CD project $GITOPS_PROJECT and Application platform-root."
echo "Argo CD will now reconcile $GITOPS_REPO_URL:$GITOPS_REPO_PATH."
