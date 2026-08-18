#!/usr/bin/env bash
set -Eeuo pipefail

echo "Checking kubectl access"
kubectl version --client=true
kubectl get nodes -o wide

echo
echo "Checking system pods"
kubectl get pods -A

echo
echo "Checking StorageClass"
kubectl get storageclass || true

echo
echo "Checking metrics API"
if kubectl top nodes >/tmp/kubee-top-nodes.out 2>/tmp/kubee-top-nodes.err; then
  cat /tmp/kubee-top-nodes.out
else
  cat /tmp/kubee-top-nodes.err
fi

