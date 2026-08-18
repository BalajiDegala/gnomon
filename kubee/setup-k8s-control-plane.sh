#!/usr/bin/env bash
# Build the first control-plane node of a two-node kubeadm cluster on Rocky/RHEL 9.
# Run as: sudo CONTROL_PLANE_IP=192.0.2.10 bash setup-k8s-control-plane.sh

set -Eeuo pipefail
trap 'echo "ERROR: line $LINENO: $BASH_COMMAND" >&2' ERR

KUBERNETES_MINOR="${KUBERNETES_MINOR:-1.36}"
CALICO_VERSION="${CALICO_VERSION:-v3.32.1}"
POD_CIDR="${POD_CIDR:-192.168.0.0/16}"
SERVICE_CIDR="${SERVICE_CIDR:-10.96.0.0/12}"
CRI_SOCKET="unix:///run/containerd/containerd.sock"

if (( EUID != 0 )); then
  echo "Run this script as root, for example: sudo bash $0" >&2
  exit 1
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

if [[ -z "${CONTROL_PLANE_IP:-}" ]]; then
  CONTROL_PLANE_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}')"
fi
if [[ -z "${CONTROL_PLANE_IP:-}" ]]; then
  echo "Could not detect the node IP. Re-run with CONTROL_PLANE_IP=<reachable-node-ip>." >&2
  exit 1
fi

echo "Kubernetes v${KUBERNETES_MINOR}; API address ${CONTROL_PLANE_IP}; pod CIDR ${POD_CIDR}"

# kubelet requires swap off. The fstab edit makes that persistent.
swapoff -a
sed -ri '/^[[:space:]]*#/!{/^[^#].*[[:space:]]swap[[:space:]]/s/^/# disabled by Kubernetes: /}' /etc/fstab

# The upstream RPM installation instructions currently require permissive SELinux.
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

# Do not ask DNF to "install" tools that are already present. On machines pinned
# to an older Rocky minor release, doing so can unexpectedly attempt a partial
# OS upgrade (for example curl/OpenSSL) before Kubernetes is even installed.
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
# Works with both containerd 1.x and 2.x generated configuration.
sed -ri 's/^([[:space:]]*)SystemdCgroup = false/\1SystemdCgroup = true/' /etc/containerd/config.toml
if grep -Eq 'disabled_plugins[[:space:]]*=.*"cri"' /etc/containerd/config.toml; then
  echo "containerd configuration unexpectedly disables CRI." >&2
  exit 1
fi
# An existing containerd process does not reload config.toml when merely enabled.
# Restart it so the CRI plugin and systemd cgroup setting above take effect.
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

# Keep NetworkManager away from interfaces created by Calico.
mkdir -p /etc/NetworkManager/conf.d
cat >/etc/NetworkManager/conf.d/calico.conf <<'EOF'
[keyfile]
unmanaged-devices=interface-name:cali*;interface-name:tunl*;interface-name:vxlan.calico
EOF
systemctl reload NetworkManager 2>/dev/null || true

# Open the control-plane and Calico VXLAN ports when firewalld is in use.
if systemctl is-active --quiet firewalld; then
  for port in 6443/tcp 2379-2380/tcp 10250/tcp 10257/tcp 10259/tcp 4789/udp; do
    firewall-cmd --permanent --add-port="$port"
  done
  firewall-cmd --permanent --zone=trusted --add-source="$POD_CIDR"
  firewall-cmd --reload
fi

if [[ ! -f /etc/kubernetes/admin.conf ]]; then
  kubeadm init \
    --apiserver-advertise-address="$CONTROL_PLANE_IP" \
    --pod-network-cidr="$POD_CIDR" \
    --service-cidr="$SERVICE_CIDR" \
    --cri-socket="$CRI_SOCKET"
else
  echo "Existing /etc/kubernetes/admin.conf found; skipping kubeadm init."
fi

export KUBECONFIG=/etc/kubernetes/admin.conf

# Install Calico through its operator and wait for its Installation CRD.
# Its large CRDs exceed the annotation limit used by client-side kubectl apply.
# Server-side apply also resumes cleanly when an earlier CRD batch was partial.
kubectl apply --server-side --force-conflicts \
  -f "https://raw.githubusercontent.com/projectcalico/calico/${CALICO_VERSION}/manifests/v1_crd_projectcalico_org.yaml"
kubectl apply --server-side --force-conflicts \
  -f "https://raw.githubusercontent.com/projectcalico/calico/${CALICO_VERSION}/manifests/tigera-operator.yaml"
kubectl wait --for=condition=Established crd/installations.operator.tigera.io --timeout=180s
cat <<EOF | kubectl apply -f -
apiVersion: operator.tigera.io/v1
kind: Installation
metadata:
  name: default
spec:
  calicoNetwork:
    ipPools:
      - cidr: ${POD_CIDR}
        encapsulation: VXLANCrossSubnet
        natOutgoing: Enabled
        nodeSelector: all()
EOF

# Give the invoking sudo user a usable kubectl configuration.
if [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != root ]]; then
  USER_HOME="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
  if [[ -z "$USER_HOME" || "$USER_HOME" == / ]]; then
    echo "Could not determine a safe home directory for $SUDO_USER." >&2
    exit 1
  fi
  # Numeric IDs supplied by sudo also work when the primary group has a
  # different name or the account comes from LDAP/SSSD.
  install -d -m 0700 -o "$SUDO_UID" -g "$SUDO_GID" "$USER_HOME/.kube"
  install -m 0600 -o "$SUDO_UID" -g "$SUDO_GID" /etc/kubernetes/admin.conf "$USER_HOME/.kube/config"
fi

echo
echo "Control plane initialized. Save and run this command with sudo on the worker:"
kubeadm token create --print-join-command
echo
echo "Check progress with: kubectl get nodes,pods -A"
