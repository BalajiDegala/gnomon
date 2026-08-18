#!/usr/bin/env bash
set -Eeuo pipefail

ROLE="${1:-}"
ENV_FILE="${2:-config/lab.env}"

if [[ "$ROLE" != "server" && "$ROLE" != "client" ]]; then
  echo "Usage: sudo $0 server|client [config/lab.env]" >&2
  exit 2
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${NTP_SERVER_IP:?Set NTP_SERVER_IP in $ENV_FILE}"
: "${NTP_UPSTREAM_HOST:?Set NTP_UPSTREAM_HOST in $ENV_FILE}"
: "${NTP_ALLOW_CIDR:?Set NTP_ALLOW_CIDR in $ENV_FILE}"

if [[ "$ROLE" == "server" ]]; then
  template="manifests/foundation/chrony-server.conf.tpl"
  if ! ip -4 address show | grep -Fq "${NTP_SERVER_IP}/"; then
    echo "This host does not own NTP_SERVER_IP=$NTP_SERVER_IP." >&2
    exit 1
  fi
else
  template="manifests/foundation/chrony-client.conf.tpl"
fi

rendered="$(mktemp)"
trap 'rm -f "$rendered"' EXIT
envsubst <"$template" >"$rendered"

if [[ ! -e /etc/chrony.conf.kubee-pre-time-sync ]]; then
  cp -a /etc/chrony.conf /etc/chrony.conf.kubee-pre-time-sync
fi

install -m 0644 "$rendered" /etc/chrony.conf
systemctl enable chronyd
systemctl restart chronyd

if [[ "$ROLE" == "server" ]] && systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-service=ntp
  firewall-cmd --add-service=ntp
fi

if [[ "$ROLE" == "client" ]]; then
  chronyc burst 4/4
  sleep 5
  chronyc makestep
  chronyc waitsync 30 0.1
fi

chronyc sources -n
chronyc tracking

if ! chronyc tracking | grep -q 'Leap status[[:space:]]*: Normal'; then
  echo "Chrony did not reach a synchronized Normal state." >&2
  exit 1
fi
