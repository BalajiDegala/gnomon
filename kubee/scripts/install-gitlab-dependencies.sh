#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${1:-config/lab.env}"
REQUIRED_POSTGRES_MAJOR=17

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

random_secret() {
  openssl rand -hex 24
}

secret_value() {
  local secret="$1"
  local key="$2"

  kubectl -n gitlab get secret "$secret" -o "jsonpath={.data.${key}}" 2>/dev/null | base64 -d || true
}

ensure_namespace() {
  kubectl create namespace gitlab --dry-run=client -o yaml | kubectl apply -f -
}

verify_postgres_version() {
  local postgres_major

  postgres_major="$(
    kubectl -n gitlab exec gitlab-postgresql-0 -- \
      postgres --version \
      | awk '{ split($3, version, "."); print version[1] }'
  )"

  if [[ "$postgres_major" -lt "$REQUIRED_POSTGRES_MAJOR" ]]; then
    cat >&2 <<EOF
GitLab requires PostgreSQL ${REQUIRED_POSTGRES_MAJOR} or newer, but the existing
database volume contains PostgreSQL ${postgres_major}.

For a brand-new lab install with no data to preserve, recreate only PostgreSQL:
  kubectl -n gitlab delete statefulset gitlab-postgresql
  kubectl -n gitlab delete pvc data-gitlab-postgresql-0
  $0 $ENV_FILE

Do not delete the PVC if it contains data that must be preserved; perform a
PostgreSQL major-version upgrade instead.
EOF
    return 1
  fi
}

ensure_basic_secrets() {
  local postgres_password
  local redis_password
  local minio_access_key
  local minio_secret_key

  postgres_password="$(secret_value gitlab-postgres psql-password)"
  redis_password="$(secret_value gitlab-redis redis-password)"
  minio_access_key="$(secret_value gitlab-minio accesskey)"
  minio_secret_key="$(secret_value gitlab-minio secretkey)"

  [[ -n "$postgres_password" ]] || postgres_password="$(random_secret)"
  [[ -n "$redis_password" ]] || redis_password="$(random_secret)"
  [[ -n "$minio_access_key" ]] || minio_access_key="gitlab"
  [[ -n "$minio_secret_key" ]] || minio_secret_key="$(random_secret)"

  kubectl -n gitlab create secret generic gitlab-postgres \
    --from-literal=psql-password="$postgres_password" \
    --dry-run=client -o yaml | kubectl apply -f -

  kubectl -n gitlab create secret generic gitlab-redis \
    --from-literal=redis-password="$redis_password" \
    --dry-run=client -o yaml | kubectl apply -f -

  kubectl -n gitlab create secret generic gitlab-minio \
    --from-literal=accesskey="$minio_access_key" \
    --from-literal=secretkey="$minio_secret_key" \
    --dry-run=client -o yaml | kubectl apply -f -
}

ensure_object_storage_secrets() {
  local minio_access_key
  local minio_secret_key
  local minio_service_ip
  local rails_config
  local backup_config

  minio_access_key="$(secret_value gitlab-minio accesskey)"
  minio_secret_key="$(secret_value gitlab-minio secretkey)"
  minio_service_ip="$(kubectl -n gitlab get service gitlab-minio -o jsonpath='{.spec.clusterIP}')"
  if [[ -z "$minio_service_ip" || "$minio_service_ip" == "None" ]]; then
    echo "gitlab-minio does not have a usable ClusterIP" >&2
    exit 1
  fi
  rails_config="$(mktemp)"
  backup_config="$(mktemp)"

  cat >"$rails_config" <<EOF
# Local self-hosted MinIO inside Kubernetes.
# GitLab's storage library uses provider: AWS for any S3-compatible endpoint.
# This does not use AWS or any external cloud service. Use the stable Service
# ClusterIP because Ruby Resolv fails for cluster-local names in this lab even
# though the operating-system resolver succeeds.
provider: AWS
region: us-east-1
aws_access_key_id: ${minio_access_key}
aws_secret_access_key: ${minio_secret_key}
endpoint: http://${minio_service_ip}:9000
path_style: true
aws_signature_version: 4
EOF

  cat >"$backup_config" <<EOF
[default]
# Local self-hosted MinIO inside Kubernetes.
access_key = ${minio_access_key}
secret_key = ${minio_secret_key}
bucket_location = us-east-1
host_base = ${minio_service_ip}:9000
host_bucket = ${minio_service_ip}:9000/%(bucket)
use_https = False
signature_v2 = False
EOF

  kubectl -n gitlab create secret generic gitlab-object-storage \
    --from-file=connection="$rails_config" \
    --dry-run=client -o yaml | kubectl apply -f -

  kubectl -n gitlab create secret generic gitlab-backup-storage \
    --from-file=config="$backup_config" \
    --dry-run=client -o yaml | kubectl apply -f -

  rm -f "$rails_config" "$backup_config"
}

create_minio_buckets() {
  local minio_access_key
  local minio_secret_key
  local job_manifest

  minio_access_key="$(secret_value gitlab-minio accesskey)"
  minio_secret_key="$(secret_value gitlab-minio secretkey)"
  job_manifest="$(mktemp)"

  kubectl -n gitlab delete job gitlab-minio-create-buckets --ignore-not-found
  cat >"$job_manifest" <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: gitlab-minio-create-buckets
  namespace: gitlab
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: mc
          image: minio/mc:RELEASE.2025-08-13T08-35-41Z
          env:
            - name: MINIO_ACCESS_KEY
              value: ${minio_access_key}
            - name: MINIO_SECRET_KEY
              value: ${minio_secret_key}
          command:
            - sh
            - -c
            - |
              set -eu
              mc alias set gitlab http://gitlab-minio:9000 "\$MINIO_ACCESS_KEY" "\$MINIO_SECRET_KEY"
              for bucket in \
                gitlab-artifacts \
                gitlab-lfs \
                gitlab-uploads \
                gitlab-packages \
                gitlab-external-diffs \
                gitlab-terraform-state \
                gitlab-ci-secure-files \
                gitlab-dependency-proxy \
                gitlab-agent-plan-content \
                gitlab-backups \
                gitlab-tmp
              do
                mc mb --ignore-existing "gitlab/\${bucket}"
              done
EOF

  kubectl apply -f "$job_manifest"
  rm -f "$job_manifest"

  kubectl -n gitlab wait --for=condition=complete job/gitlab-minio-create-buckets --timeout=180s
}

ensure_namespace
ensure_basic_secrets
kubectl apply -f manifests/gitlab/dependencies.yaml
ensure_object_storage_secrets

kubectl -n gitlab rollout status statefulset/gitlab-postgresql --timeout=300s
verify_postgres_version
kubectl -n gitlab rollout status statefulset/gitlab-redis --timeout=300s
kubectl -n gitlab rollout status statefulset/gitlab-minio --timeout=300s

create_minio_buckets

echo "GitLab lab dependencies are ready."
