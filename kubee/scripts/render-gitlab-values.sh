#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${1:-config/lab.env}"
OUTPUT_FILE="${2:-manifests/gitlab/gitlab-values.yaml}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

INGRESS_LB_IP="${INGRESS_LB_IP:-}"
if [[ -z "$INGRESS_LB_IP" ]]; then
  INGRESS_LB_IP="$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)"
fi

if [[ -z "$INGRESS_LB_IP" ]]; then
  echo "Could not detect ingress LoadBalancer IP. Set INGRESS_LB_IP in $ENV_FILE." >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT_FILE")"
envsubst < manifests/gitlab/gitlab-values.yaml.tpl > "$OUTPUT_FILE"
echo "Rendered $OUTPUT_FILE with INGRESS_LB_IP=$INGRESS_LB_IP"
