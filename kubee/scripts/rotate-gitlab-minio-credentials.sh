#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${1:-config/lab.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

minio_access_key="$(
  kubectl -n gitlab get secret gitlab-minio \
    -o 'jsonpath={.data.accesskey}' | base64 --decode
)"

if [[ -z "$minio_access_key" ]]; then
  echo "gitlab-minio does not contain an access key" >&2
  exit 1
fi

new_secret_key="$(openssl rand -hex 24)"

kubectl -n gitlab create secret generic gitlab-minio \
  --from-literal=accesskey="$minio_access_key" \
  --from-literal=secretkey="$new_secret_key" \
  --dry-run=client -o yaml | kubectl apply -f -

# MinIO reads its credentials only at startup. Restart it before regenerating
# the clients, otherwise the bucket job would use the new secret against a
# server process that still expects the old one.
kubectl -n gitlab rollout restart statefulset/gitlab-minio
kubectl -n gitlab rollout status statefulset/gitlab-minio --timeout=5m

# This regenerates the Rails and backup object-storage secrets from
# gitlab-minio, confirms every dependency, and checks that all buckets exist.
scripts/install-gitlab-dependencies.sh "$ENV_FILE"

for deployment in \
  gitlab-webservice-default \
  gitlab-sidekiq-all-in-1-v2 \
  gitlab-toolbox
do
  kubectl -n gitlab rollout restart "deployment/$deployment"
done

for deployment in \
  gitlab-webservice-default \
  gitlab-sidekiq-all-in-1-v2 \
  gitlab-toolbox
do
  kubectl -n gitlab rollout status "deployment/$deployment" --timeout=10m
done

echo "GitLab MinIO credentials rotated; no credential value was printed."
