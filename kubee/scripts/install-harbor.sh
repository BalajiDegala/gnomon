#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${1:-config/lab.env}"
VALUES_FILE="${2:-manifests/harbor/harbor-values.yaml}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${HARBOR_HOST:?Set HARBOR_HOST in $ENV_FILE}"

if [[ ! -f "$VALUES_FILE" ]]; then
  scripts/render-harbor-values.sh "$ENV_FILE" "$VALUES_FILE"
fi

kubectl create namespace harbor --dry-run=client -o yaml | kubectl apply -f -

admin_password="$(
  kubectl -n harbor get secret harbor-admin-password \
    -o jsonpath='{.data.HARBOR_ADMIN_PASSWORD}' 2>/dev/null \
    | base64 -d || true
)"

if [[ -z "$admin_password" ]]; then
  admin_password="$(openssl rand -base64 24 | tr -d '\n')"
fi

kubectl -n harbor create secret generic harbor-admin-password \
  --from-literal=HARBOR_ADMIN_PASSWORD="$admin_password" \
  --dry-run=client -o yaml | kubectl apply -f -

helm repo add harbor https://helm.goharbor.io
helm repo update harbor

helm upgrade --install harbor harbor/harbor \
  --namespace harbor \
  --timeout 20m \
  --values "$VALUES_FILE"

echo
echo "Harbor installation completed."
echo "URL: http://$HARBOR_HOST"
echo "Username: admin"
echo "Retrieve the password with:"
echo "kubectl -n harbor get secret harbor-admin-password -o jsonpath='{.data.HARBOR_ADMIN_PASSWORD}' | base64 -d; echo"
