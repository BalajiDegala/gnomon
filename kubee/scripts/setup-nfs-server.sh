#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo "ERROR: line $LINENO: $BASH_COMMAND" >&2' ERR

ENV_FILE="${1:-config/lab.env}"

if (( EUID != 0 )); then
  echo "Run this script as root on the NFS server." >&2
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
: "${NFS_EXPORT_CIDR:?Set NFS_EXPORT_CIDR in $ENV_FILE}"

if [[ "$NFS_EXPORT_PATH" != /* || "$NFS_EXPORT_PATH" == / ]]; then
  echo "NFS_EXPORT_PATH must be an absolute path other than /." >&2
  exit 1
fi
if ! ip -4 address show | grep -Fq "${NFS_SERVER_IP}/"; then
  echo "This host does not own NFS_SERVER_IP=$NFS_SERVER_IP." >&2
  exit 1
fi

parent_mount="$(findmnt -n -o TARGET -T "$(dirname "$NFS_EXPORT_PATH")")"
if [[ -z "$parent_mount" || "$parent_mount" == / ]]; then
  echo "Refusing to place NFS data on the root filesystem; parent mount is ${parent_mount:-unknown}." >&2
  exit 1
fi

if ! rpm -q nfs-utils >/dev/null 2>&1; then
  dnf install -y nfs-utils
fi

install -d -m 0770 "$NFS_EXPORT_PATH"
install -d -m 0755 /etc/exports.d /etc/systemd/system/nfs-server.service.d

exports_tmp="$(mktemp)"
dropin_tmp="$(mktemp)"
trap 'rm -f "$exports_tmp" "$dropin_tmp"' EXIT

printf '%s %s(rw,sync,no_subtree_check,no_root_squash)\n' \
  "$NFS_EXPORT_PATH" "$NFS_EXPORT_CIDR" >"$exports_tmp"
install -m 0644 "$exports_tmp" /etc/exports.d/kubee-nfs.exports

cat >"$dropin_tmp" <<EOF
[Unit]
RequiresMountsFor=$NFS_EXPORT_PATH
Wants=network-online.target
After=network-online.target
EOF
install -m 0644 "$dropin_tmp" /etc/systemd/system/nfs-server.service.d/kubee-storage.conf

systemctl daemon-reload
systemctl enable --now nfs-server
systemctl start rpc-statd 2>/dev/null || true
exportfs -rav

if systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-service=nfs
  firewall-cmd --permanent --add-service=rpc-bind
  firewall-cmd --permanent --add-service=mountd
  firewall-cmd --reload
fi

echo "NFS server is ready"
findmnt -no SOURCE,TARGET,FSTYPE,OPTIONS -T "$NFS_EXPORT_PATH"
exportfs -v
rpcinfo -t "$NFS_SERVER_IP" nfs 4
