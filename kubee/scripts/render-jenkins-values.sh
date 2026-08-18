#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${1:-config/lab.env}"
OUTPUT_FILE="${2:-manifests/jenkins/jenkins-values.yaml}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${JENKINS_HOST:?Set JENKINS_HOST in $ENV_FILE}"
: "${JENKINS_STORAGE_CLASS:?Set JENKINS_STORAGE_CLASS in $ENV_FILE}"
: "${JENKINS_HOME_CLAIM:?Set JENKINS_HOME_CLAIM in $ENV_FILE}"

mkdir -p "$(dirname "$OUTPUT_FILE")"
envsubst < manifests/jenkins/jenkins-values.yaml.tpl > "$OUTPUT_FILE"
echo "Rendered $OUTPUT_FILE for $JENKINS_HOST"
