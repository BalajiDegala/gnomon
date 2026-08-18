#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${1:-config/lab.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

INGRESS_IP="${2:-}"
if [[ -z "${INGRESS_IP:-}" ]]; then
  INGRESS_IP="$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)"
fi

if [[ -z "$INGRESS_IP" ]]; then
  echo "Could not detect ingress LoadBalancer IP." >&2
  echo "Pass it explicitly: $0 $ENV_FILE 10.191.0.240" >&2
  exit 1
fi

cat <<EOF
Create these DNS A records:

$GITLAB_HOST  A  $INGRESS_IP
$HARBOR_HOST  A  $INGRESS_IP
$JENKINS_HOST A  $INGRESS_IP
$SONAR_HOST   A  $INGRESS_IP
$ARGOCD_HOST  A  $INGRESS_IP
$NEXUS_HOST   A  $INGRESS_IP
EOF
