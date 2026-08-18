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

echo "Checking NFSv4 endpoint $NFS_SERVER_IP:$NFS_EXPORT_PATH"
rpcinfo -t "$NFS_SERVER_IP" nfs 4

echo
echo "Checking CSI objects"
kubectl get csidriver nfs.csi.k8s.io
kubectl get deployment/csi-nfs-controller daemonset/csi-nfs-node -n kube-system
kubectl get pods -n kube-system -l app.kubernetes.io/instance=csi-driver-nfs -o wide

echo
echo "Checking StorageClass"
kubectl get storageclass "$NFS_STORAGE_CLASS" -o wide

echo
echo "PVCs using $NFS_STORAGE_CLASS"
kubectl get pvc -A \
  -o custom-columns='NAMESPACE:.metadata.namespace,NAME:.metadata.name,STATUS:.status.phase,CAPACITY:.status.capacity.storage,ACCESS:.status.accessModes[*],CLASS:.spec.storageClassName' \
  | awk -v storage_class="$NFS_STORAGE_CLASS" 'NR == 1 || $NF == storage_class'

echo
echo "PVs using $NFS_STORAGE_CLASS"
kubectl get pv \
  -o custom-columns='NAME:.metadata.name,STATUS:.status.phase,CAPACITY:.spec.capacity.storage,RECLAIM:.spec.persistentVolumeReclaimPolicy,CLASS:.spec.storageClassName,CLAIM:.spec.claimRef.namespace/.spec.claimRef.name' \
  | awk -v storage_class="$NFS_STORAGE_CLASS" 'NR == 1 || $(NF-1) == storage_class'

echo
echo "For a destructive-free end-to-end test, run: scripts/test-nfs-storage.sh $ENV_FILE"
echo "On the NFS server, also check: df -h $NFS_EXPORT_PATH"
