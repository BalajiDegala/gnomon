#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${1:-config/lab.env}"
CONTAINERD_CONFIG="/etc/containerd/config.toml"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root." >&2
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

: "${HARBOR_HOST:?Set HARBOR_HOST in $ENV_FILE}"
: "${INGRESS_LB_IP:?Set INGRESS_LB_IP in $ENV_FILE}"

if [[ ! -f "$CONTAINERD_CONFIG" ]]; then
  echo "Missing $CONTAINERD_CONFIG" >&2
  exit 1
fi

if ! grep -Eq "^[[:space:]]*${INGRESS_LB_IP}[[:space:]].*\b${HARBOR_HOST}\b" /etc/hosts; then
  if grep -Eq "[[:space:]]${HARBOR_HOST}([[:space:]]|$)" /etc/hosts; then
    echo "$HARBOR_HOST already exists in /etc/hosts with another address." >&2
    exit 1
  fi
  if [[ ! -e /etc/hosts.kubee-pre-harbor ]]; then
    cp -a /etc/hosts /etc/hosts.kubee-pre-harbor
  fi
  printf '%s %s\n' "$INGRESS_LB_IP" "$HARBOR_HOST" >>/etc/hosts
fi

if [[ ! -e "${CONTAINERD_CONFIG}.kubee-pre-harbor" ]]; then
  cp -a "$CONTAINERD_CONFIG" "${CONTAINERD_CONFIG}.kubee-pre-harbor"
fi

if ! grep -Eq "config_path[[:space:]]*=[[:space:]]*['\"]?/etc/containerd/certs.d" "$CONTAINERD_CONFIG"; then
  rendered_config="$(mktemp)"
  if ! awk '
    /^[[:space:]]*\[plugins[.].*[.]registry\][[:space:]]*$/ {
      in_registry = 1
      print
      next
    }
    in_registry && /^[[:space:]]*config_path[[:space:]]*=/ {
      sub(/config_path[[:space:]]*=.*/, "config_path = \"/etc/containerd/certs.d\"")
      in_registry = 0
      changed = 1
    }
    { print }
    END { if (!changed) exit 42 }
  ' "$CONTAINERD_CONFIG" >"$rendered_config"; then
    rm -f "$rendered_config"
    echo "Could not locate containerd's registry config_path." >&2
    exit 1
  fi
  install -m 0644 "$rendered_config" "$CONTAINERD_CONFIG"
  rm -f "$rendered_config"
fi

registry_dir="/etc/containerd/certs.d/$HARBOR_HOST"
install -d -m 0755 "$registry_dir"
hosts_file="$(mktemp)"
trap 'rm -f "$hosts_file"' EXIT
cat >"$hosts_file" <<EOF
server = "http://$HARBOR_HOST"

[host."http://$HARBOR_HOST"]
  capabilities = ["pull", "resolve", "push"]
EOF
install -m 0644 "$hosts_file" "$registry_dir/hosts.toml"

systemctl restart containerd
systemctl is-active --quiet containerd

echo "containerd trusts the lab HTTP registry $HARBOR_HOST on $(hostname)."
