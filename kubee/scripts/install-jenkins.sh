#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${1:-config/lab.env}"
VALUES_FILE="${2:-manifests/jenkins/jenkins-values.yaml}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${JENKINS_HOST:?Set JENKINS_HOST in $ENV_FILE}"
: "${JENKINS_CHART_VERSION:?Set JENKINS_CHART_VERSION in $ENV_FILE}"
: "${JENKINS_STORAGE_CLASS:?Set JENKINS_STORAGE_CLASS in $ENV_FILE}"
: "${JENKINS_HOME_CLAIM:?Set JENKINS_HOME_CLAIM in $ENV_FILE}"

if [[ ! -f "$VALUES_FILE" ]]; then
  scripts/render-jenkins-values.sh "$ENV_FILE" "$VALUES_FILE"
fi

kubectl create namespace jenkins --dry-run=client -o yaml | kubectl apply -f -

home_claim_manifest="$(mktemp)"
trap 'rm -f "$home_claim_manifest"' EXIT
envsubst '${JENKINS_HOME_CLAIM} ${JENKINS_STORAGE_CLASS}' \
  < manifests/jenkins/jenkins-home-pvc.yaml.tpl >"$home_claim_manifest"
kubectl apply -f "$home_claim_manifest"
kubectl wait --for=jsonpath='{.status.phase}'=Bound \
  "pvc/$JENKINS_HOME_CLAIM" -n jenkins --timeout=2m

admin_password="$(
  kubectl -n jenkins get secret jenkins-admin \
    -o jsonpath='{.data.jenkins-admin-password}' 2>/dev/null \
    | base64 -d || true
)"

if [[ -z "$admin_password" ]]; then
  admin_password="$(openssl rand -base64 24 | tr -d '\n')"
fi

kubectl -n jenkins create secret generic jenkins-admin \
  --from-literal=jenkins-admin-user=admin \
  --from-literal=jenkins-admin-password="$admin_password" \
  --dry-run=client -o yaml | kubectl apply -f -

helm repo add jenkinsci https://charts.jenkins.io
helm repo update jenkinsci

helm upgrade --install jenkins jenkinsci/jenkins \
  --namespace jenkins \
  --version "$JENKINS_CHART_VERSION" \
  --timeout 20m \
  --values "$VALUES_FILE"

echo
echo "Jenkins installation completed."
echo "URL: http://$JENKINS_HOST"
echo "Username: admin"
echo "Retrieve the password with:"
echo "kubectl -n jenkins get secret jenkins-admin -o jsonpath='{.data.jenkins-admin-password}' | base64 -d; echo"
