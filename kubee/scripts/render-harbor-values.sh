#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${1:-config/lab.env}"
OUTPUT_FILE="${2:-manifests/harbor/harbor-values.yaml}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${HARBOR_HOST:?Set HARBOR_HOST in $ENV_FILE}"
: "${DEFAULT_STORAGE:?Set DEFAULT_STORAGE in $ENV_FILE}"

mkdir -p "$(dirname "$OUTPUT_FILE")"
envsubst < manifests/harbor/harbor-values.yaml.tpl > "$OUTPUT_FILE"
echo "Rendered $OUTPUT_FILE for $HARBOR_HOST"
