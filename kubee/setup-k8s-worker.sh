#!/usr/bin/env bash
# Prepare and join a Rocky/RHEL 9 worker node to a kubeadm cluster.
#
# Copy this file to the worker, then use the values printed by the control plane:
# sudo bash setup-k8s-worker.sh -- \
#   10.191.0.40:6443 --token TOKEN \
#   --discovery-token-ca-cert-hash sha256:HASH

set -Eeuo pipefail
trap 'echo "ERROR: line $LINENO: $BASH_COMMAND" >&2' ERR

KUBERNETES_MINOR="${KUBERNETES_MINOR:-1.36}"
POD_CIDR="${POD_CIDR:-192.168.0.0/16}"
CRI_SOCKET="unix:///run/containerd/containerd.sock"

if (( EUID != 0 )); then
  echo "Run this script with sudo." >&2
  exit 1
fi

if [[ "${1:-}" == -- ]]; then
  shift
fi
if (( $# == 0 )) && [[ ! -f /etc/kubernetes/kubelet.conf ]]; then
  echo "Usage: sudo bash $0 -- CONTROL_PLANE:6443 --token TOKEN --discovery-token-ca-cert-hash sha256:HASH" >&2
  exit 2
fi

if [[ ! -r /etc/os-release ]]; then
  echo "Cannot identify this Linux distribution." >&2
  exit 1
fi
. /etc/os-release
if [[ "${ID_LIKE:-} ${ID:-}" != *rhel* && "${ID_LIKE:-} ${ID:-}" != *fedora* ]]; then
  echo "This script supports Rocky/RHEL-compatible Linux 9; found ${PRETTY_NAME:-unknown}." >&2
  exit 1
fi

echo "Preparing worker for Kubernetes v${KUBERNETES_MINOR}"

swapoff -a
sed -ri '/^[[:space:]]*#/!{/^[^#].*[[:space:]]swap[[:space:]]/s/^/# disabled by Kubernetes: /}' /etc/fstab

setenforce 0 2>/dev/null || true
sed -ri 's/^SELINUX=enforcing$/SELINUX=permissive/' /etc/selinux/config

cat >/etc/modules-load.d/k8s.conf <<'EOF'
overlay
br_netfilter
EOF
modprobe overlay
modprobe br_netfilter

cat >/etc/sysctl.d/99-kubernetes-cri.conf <<'EOF'
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
sysctl --system >/dev/null

# Install only missing prerequisites. This avoids triggering an unrelated
# partial Rocky minor-version upgrade on machines with pinned packages.
missing_packages=()
rpm -q dnf-plugins-core >/dev/null 2>&1 || missing_packages+=(dnf-plugins-core)
rpm -q curl >/dev/null 2>&1 || missing_packages+=(curl)
rpm -q ca-certificates >/dev/null 2>&1 || missing_packages+=(ca-certificates)
if (( ${#missing_packages[@]} )); then
  dnf install -y "${missing_packages[@]}"
fi

if ! command -v containerd >/dev/null 2>&1; then
  dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
  dnf install -y containerd.io
fi

mkdir -p /etc/containerd
if [[ -s /etc/containerd/config.toml ]]; then
  cp -a /etc/containerd/config.toml "/etc/containerd/config.toml.pre-kubernetes.$(date +%Y%m%d%H%M%S)"
fi
containerd config default >/etc/containerd/config.toml
sed -ri 's/^([[:space:]]*)SystemdCgroup = false/\1SystemdCgroup = true/' /etc/containerd/config.toml
if grep -Eq 'disabled_plugins[[:space:]]*=.*"cri"' /etc/containerd/config.toml; then
  echo "containerd configuration unexpectedly disables CRI." >&2
  exit 1
fi
systemctl enable containerd
systemctl restart containerd
systemctl is-active --quiet containerd

cat >/etc/yum.repos.d/kubernetes.repo <<EOF
[kubernetes]
name=Kubernetes
baseurl=https://pkgs.k8s.io/core:/stable:/v${KUBERNETES_MINOR}/rpm/
enabled=1
gpgcheck=1
gpgkey=https://pkgs.k8s.io/core:/stable:/v${KUBERNETES_MINOR}/rpm/repodata/repomd.xml.key
exclude=kubelet kubeadm kubectl cri-tools kubernetes-cni
EOF
dnf install -y kubelet kubeadm kubectl --disableexcludes=kubernetes
systemctl enable kubelet

# NetworkManager must leave Calico-created interfaces alone.
mkdir -p /etc/NetworkManager/conf.d
cat >/etc/NetworkManager/conf.d/calico.conf <<'EOF'
[keyfile]
unmanaged-devices=interface-name:cali*;interface-name:tunl*;interface-name:vxlan.calico
EOF
systemctl reload NetworkManager 2>/dev/null || true

if systemctl is-active --quiet firewalld; then
  for port in 10250/tcp 30000-32767/tcp 30000-32767/udp 4789/udp; do
    firewall-cmd --permanent --add-port="$port"
  done
  firewall-cmd --permanent --zone=trusted --add-source="$POD_CIDR"
  firewall-cmd --reload
fi

if [[ -f /etc/kubernetes/kubelet.conf ]]; then
  echo "This machine is already joined to a Kubernetes cluster; skipping kubeadm join."
else
  kubeadm join "$@" --cri-socket="$CRI_SOCKET"
fi

echo
echo "Worker setup completed. On the control plane, run: kubectl get nodes"
