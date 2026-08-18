#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo "ERROR: line $LINENO: $BASH_COMMAND" >&2' ERR

ENV_FILE="${1:-config/lab.env}"

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
: "${NFS_STORAGE_CLASS:?Set NFS_STORAGE_CLASS in $ENV_FILE}"

NFS_CSI_VERSION="${NFS_CSI_VERSION:-4.13.4}"

command -v kubectl >/dev/null
command -v helm >/dev/null
kubectl auth can-i create storageclasses.storage.k8s.io | grep -qx yes
rpcinfo -t "$NFS_SERVER_IP" nfs 4

echo "Installing NFS CSI driver chart $NFS_CSI_VERSION"
helm repo add csi-driver-nfs https://kubernetes-csi.github.io/csi-driver-nfs --force-update
helm repo update csi-driver-nfs
helm upgrade --install csi-driver-nfs csi-driver-nfs/csi-driver-nfs \
  --namespace kube-system \
  --version "$NFS_CSI_VERSION" \
  --wait \
  --timeout 10m

echo "Applying StorageClass $NFS_STORAGE_CLASS"
rendered="$(mktemp)"
trap 'rm -f "$rendered"' EXIT
envsubst < manifests/foundation/nfs-storageclass.yaml.tpl >"$rendered"
kubectl apply -f "$rendered"

kubectl rollout status deployment/csi-nfs-controller -n kube-system --timeout=300s
kubectl rollout status daemonset/csi-nfs-node -n kube-system --timeout=300s
kubectl get csidriver nfs.csi.k8s.io
kubectl get storageclass "$NFS_STORAGE_CLASS" -o wide

echo "NFS CSI storage installed. The default StorageClass was not changed."
