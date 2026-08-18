#!/usr/bin/env bash
set -Eeuo pipefail

if (( $# != 3 )); then
  echo "Usage: $0 ENV_FILE TEMPLATE_FILE OUTPUT_FILE" >&2
  exit 2
fi

ENV_FILE="$1"
TEMPLATE_FILE="$2"
OUTPUT_FILE="$3"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi
if [[ ! -f "$TEMPLATE_FILE" ]]; then
  echo "Missing template file: $TEMPLATE_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

envsubst < "$TEMPLATE_FILE" > "$OUTPUT_FILE"
echo "Rendered $OUTPUT_FILE"

