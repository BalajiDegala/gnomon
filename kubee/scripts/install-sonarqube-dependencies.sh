#!/usr/bin/env bash
set -Eeuo pipefail

kubectl create namespace sonarqube --dry-run=client -o yaml | kubectl apply -f -

database_password="$(
  kubectl -n sonarqube get secret sonarqube-postgresql \
    -o jsonpath='{.data.password}' 2>/dev/null | base64 -d || true
)"
monitoring_passcode="$(
  kubectl -n sonarqube get secret sonarqube-monitoring \
    -o jsonpath='{.data.passcode}' 2>/dev/null | base64 -d || true
)"

[[ -n "$database_password" ]] || database_password="$(openssl rand -hex 24)"
[[ -n "$monitoring_passcode" ]] || monitoring_passcode="$(openssl rand -hex 24)"

kubectl -n sonarqube create secret generic sonarqube-postgresql \
  --from-literal=password="$database_password" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n sonarqube create secret generic sonarqube-monitoring \
  --from-literal=passcode="$monitoring_passcode" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f manifests/sonarqube/dependencies.yaml
kubectl -n sonarqube rollout status statefulset/sonarqube-postgresql --timeout=300s

echo "SonarQube PostgreSQL dependency is ready."
