#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo "ERROR: line $LINENO: $BASH_COMMAND" >&2' ERR

ENV_FILE="${1:-config/lab.env}"

if (( EUID != 0 )); then
  echo "Run this script as root on every Kubernetes node." >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${NFS_SERVER_IP:?Set NFS_SERVER_IP in $ENV_FILE}"
: "${NFS_EXPORT_PATH:?Set NFS_EXPORT_PATH in $ENV_FILE}"

if ! rpm -q nfs-utils >/dev/null 2>&1; then
  dnf install -y nfs-utils
fi

rpcinfo -t "$NFS_SERVER_IP" nfs 4

test_mount="$(mktemp -d)"
test_file="$test_mount/.client-test-$(hostname)-$$"
cleanup() {
  rm -f "$test_file" 2>/dev/null || true
  mountpoint -q "$test_mount" && timeout 30 umount "$test_mount" || true
  rmdir "$test_mount" 2>/dev/null || true
}
trap cleanup EXIT

timeout 30 mount -t nfs -o nfsvers=4.1,hard,timeo=600,retrans=2 \
  "$NFS_SERVER_IP:$NFS_EXPORT_PATH" "$test_mount"
printf 'nfs-client-ok host=%s time=%s\n' "$(hostname)" "$(date -Is)" >"$test_file"
cat "$test_file"

echo "NFS client test passed on $(hostname)"
