#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo "ERROR: line $LINENO: $BASH_COMMAND" >&2' ERR

ENV_FILE="${1:-config/lab.env}"
VALUES_FILE="${2:-manifests/argocd/argocd-values.yaml}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${ARGOCD_HOST:?Set ARGOCD_HOST in $ENV_FILE}"
: "${ARGOCD_CHART_VERSION:?Set ARGOCD_CHART_VERSION in $ENV_FILE}"
: "${ARGOCD_CERT_ISSUER:?Set ARGOCD_CERT_ISSUER in $ENV_FILE}"

command -v kubectl >/dev/null
command -v helm >/dev/null
kubectl cluster-info >/dev/null
kubectl get ingressclass nginx >/dev/null
kubectl get clusterissuer "$ARGOCD_CERT_ISSUER" >/dev/null

scripts/render-argocd-values.sh "$ENV_FILE" "$VALUES_FILE"

echo "Installing Argo CD chart $ARGOCD_CHART_VERSION"
helm repo add argo https://argoproj.github.io/argo-helm --force-update
helm repo update argo
helm upgrade --install argocd argo/argo-cd \
  --namespace argocd \
  --create-namespace \
  --version "$ARGOCD_CHART_VERSION" \
  --values "$VALUES_FILE" \
  --atomic \
  --wait \
  --timeout 15m

kubectl wait --namespace argocd \
  --for=condition=Ready certificate/argocd-server \
  --timeout=300s

echo
echo "Argo CD installation completed."
echo "URL: https://$ARGOCD_HOST"
echo "Username: admin"
echo "Retrieve the one-time password with:"
echo "kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 --decode; echo"
echo "Change that password after the first login, then delete the initial-password Secret."
