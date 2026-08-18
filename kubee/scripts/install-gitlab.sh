#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${1:-config/lab.env}"
VALUES_FILE="${2:-manifests/gitlab/gitlab-values.yaml}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

if [[ ! -f "$VALUES_FILE" ]]; then
  scripts/render-gitlab-values.sh "$ENV_FILE" "$VALUES_FILE"
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

HELM_RETRIES="${HELM_RETRIES:-3}"

run_with_retries() {
  local attempt
  local max_attempts="$1"
  shift

  for (( attempt = 1; attempt <= max_attempts; attempt++ )); do
    if "$@"; then
      return 0
    fi

    if (( attempt == max_attempts )); then
      return 1
    fi

    echo "Command failed; retrying in 30s ($attempt/$max_attempts): $*"
    sleep 30
  done
}

kubectl create namespace gitlab --dry-run=client -o yaml | kubectl apply -f -

helm repo add gitlab https://charts.gitlab.io/
helm repo update gitlab

run_with_retries "$HELM_RETRIES" helm upgrade --install gitlab gitlab/gitlab \
  --namespace gitlab \
  --timeout 20m \
  --values "$VALUES_FILE"

echo
echo "GitLab install submitted. Watch progress with:"
echo "kubectl get pods -n gitlab -w"
echo
echo "After pods are ready, get the initial root password with:"
echo "kubectl get secret -n gitlab gitlab-gitlab-initial-root-password -o jsonpath='{.data.password}' | base64 -d; echo"
