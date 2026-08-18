#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${1:-config/lab.env}"
VALUES_FILE="${2:-manifests/sonarqube/sonarqube-values.yaml}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${SONAR_HOST:?Set SONAR_HOST in $ENV_FILE}"

if [[ ! -f "$VALUES_FILE" ]]; then
  scripts/render-sonarqube-values.sh "$ENV_FILE" "$VALUES_FILE"
fi

helm repo add sonarqube https://SonarSource.github.io/helm-chart-sonarqube
helm repo update sonarqube

helm upgrade --install sonarqube sonarqube/sonarqube \
  --namespace sonarqube \
  --timeout 20m \
  --values "$VALUES_FILE"

echo
echo "SonarQube installation completed."
echo "URL: http://$SONAR_HOST"
echo "Initial credentials: admin / admin (change immediately after login)"
