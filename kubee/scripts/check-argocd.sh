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

: "${ARGOCD_HOST:?Set ARGOCD_HOST in $ENV_FILE}"
: "${INGRESS_LB_IP:?Set INGRESS_LB_IP in $ENV_FILE}"

echo "Helm release"
helm list --namespace argocd

echo
echo "Workloads and endpoints"
kubectl get deployment,statefulset,pod,service,ingress,networkpolicy \
  --namespace argocd -o wide

echo
echo "TLS certificate"
kubectl get certificate,certificaterequest --namespace argocd
kubectl wait --namespace argocd \
  --for=condition=Ready certificate/argocd-server \
  --timeout=30s

echo
echo "GitOps objects"
kubectl get appproject,application --namespace argocd

echo
echo "External health endpoint"
health_response="$(curl --insecure --fail --silent --show-error \
  --resolve "$ARGOCD_HOST:443:$INGRESS_LB_IP" \
  "https://$ARGOCD_HOST/healthz")"
if [[ "$health_response" != "ok" ]]; then
  echo "Unexpected /healthz response: $health_response" >&2
  exit 1
fi
echo "https://$ARGOCD_HOST/healthz returned ok"
