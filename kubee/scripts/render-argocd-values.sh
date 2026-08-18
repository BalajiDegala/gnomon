#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo "ERROR: line $LINENO: $BASH_COMMAND" >&2' ERR

ENV_FILE="${1:-config/lab.env}"
OUTPUT_FILE="${2:-manifests/argocd/argocd-values.yaml}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${ARGOCD_HOST:?Set ARGOCD_HOST in $ENV_FILE}"
: "${ARGOCD_CERT_ISSUER:?Set ARGOCD_CERT_ISSUER in $ENV_FILE}"
: "${GITLAB_HOST:?Set GITLAB_HOST in $ENV_FILE}"
: "${INGRESS_LB_IP:?Set INGRESS_LB_IP in $ENV_FILE}"

mkdir -p "$(dirname "$OUTPUT_FILE")"
envsubst < manifests/argocd/argocd-values.yaml.tpl > "$OUTPUT_FILE"
echo "Rendered $OUTPUT_FILE for https://$ARGOCD_HOST"
