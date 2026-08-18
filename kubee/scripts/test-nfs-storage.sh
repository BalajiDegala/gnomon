#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo "ERROR: line $LINENO: $BASH_COMMAND" >&2' ERR

ENV_FILE="${1:-config/lab.env}"
TEST_NAMESPACE="nfs-storage-smoke"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${NFS_STORAGE_CLASS:?Set NFS_STORAGE_CLASS in $ENV_FILE}"
: "${NFS_TEST_WRITER_NODE:?Set NFS_TEST_WRITER_NODE in $ENV_FILE}"
: "${NFS_TEST_READER_NODE:?Set NFS_TEST_READER_NODE in $ENV_FILE}"

if kubectl get namespace "$TEST_NAMESPACE" >/dev/null 2>&1; then
  echo "Namespace $TEST_NAMESPACE already exists; inspect or remove it before retrying." >&2
  exit 1
fi

manifest="$(mktemp)"
trap 'rm -f "$manifest"' EXIT
cat >"$manifest" <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: $TEST_NAMESPACE
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: shared-data
  namespace: $TEST_NAMESPACE
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: $NFS_STORAGE_CLASS
  resources:
    requests:
      storage: 1Gi
---
apiVersion: batch/v1
kind: Job
metadata:
  name: writer
  namespace: $TEST_NAMESPACE
spec:
  backoffLimit: 1
  template:
    spec:
      nodeSelector:
        kubernetes.io/hostname: $NFS_TEST_WRITER_NODE
      restartPolicy: Never
      containers:
        - name: writer
          image: busybox:1.36.1
          command:
            - sh
            - -c
            - printf 'cross-node-nfs-ok writer=%s time=%s\n' "\$(hostname)" "\$(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee /data/cross-node.txt; sync
          volumeMounts:
            - name: data
              mountPath: /data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: shared-data
EOF

kubectl apply -f "$manifest"
kubectl wait --for=jsonpath='{.status.phase}'=Bound "pvc/shared-data" -n "$TEST_NAMESPACE" --timeout=180s
kubectl wait --for=condition=Complete "job/writer" -n "$TEST_NAMESPACE" --timeout=180s
kubectl logs "job/writer" -n "$TEST_NAMESPACE"

cat >"$manifest" <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: reader
  namespace: $TEST_NAMESPACE
spec:
  backoffLimit: 1
  template:
    spec:
      nodeSelector:
        kubernetes.io/hostname: $NFS_TEST_READER_NODE
      restartPolicy: Never
      containers:
        - name: reader
          image: busybox:1.36.1
          command: ["sh", "-c", "test -s /data/cross-node.txt && cat /data/cross-node.txt"]
          volumeMounts:
            - name: data
              mountPath: /data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: shared-data
EOF

kubectl apply -f "$manifest"
kubectl wait --for=condition=Complete "job/reader" -n "$TEST_NAMESPACE" --timeout=180s
kubectl logs "job/reader" -n "$TEST_NAMESPACE"

echo "Testing expansion from 1Gi to 2Gi"
kubectl patch pvc shared-data -n "$TEST_NAMESPACE" --type merge \
  -p '{"spec":{"resources":{"requests":{"storage":"2Gi"}}}}'
for _ in {1..30}; do
  capacity="$(kubectl get pvc shared-data -n "$TEST_NAMESPACE" -o jsonpath='{.status.capacity.storage}')"
  [[ "$capacity" == 2Gi ]] && break
  sleep 2
done
if [[ "${capacity:-}" != 2Gi ]]; then
  echo "PVC expansion did not reach 2Gi." >&2
  exit 1
fi

pv_name="$(kubectl get pvc shared-data -n "$TEST_NAMESPACE" -o jsonpath='{.spec.volumeName}')"
server="$(kubectl get pv "$pv_name" -o jsonpath='{.spec.csi.volumeAttributes.server}')"
share="$(kubectl get pv "$pv_name" -o jsonpath='{.spec.csi.volumeAttributes.share}')"
echo "Provisioned $pv_name from $server:$share; cross-node read/write and expansion passed."

# The production class retains data by default. Change only this disposable
# test PV to Delete so the CSI driver removes the test subdirectory.
kubectl patch pv "$pv_name" --type merge -p '{"spec":{"persistentVolumeReclaimPolicy":"Delete"}}'
kubectl delete namespace "$TEST_NAMESPACE" --wait=true --timeout=180s
for _ in {1..30}; do
  kubectl get pv "$pv_name" >/dev/null 2>&1 || break
  sleep 2
done
if kubectl get pv "$pv_name" >/dev/null 2>&1; then
  echo "Test PV $pv_name was not deleted; inspect CSI controller logs." >&2
  exit 1
fi

echo "NFS storage smoke test passed and disposable resources were removed."
