#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${1:-config/lab.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  echo "Create one from config/lab.env.example first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${METALLB_ADDRESS_POOL:?Set METALLB_ADDRESS_POOL in $ENV_FILE}"

HELM_RETRIES="${HELM_RETRIES:-3}"
METALLB_VERSION="${METALLB_VERSION:-v0.16.1}"
CERT_MANAGER_VERSION="${CERT_MANAGER_VERSION:-v1.19.1}"

run_with_retries() {
  local attempt
  local max_attempts="$1"
  shift

  for (( attempt = 1; attempt <= max_attempts; attempt++ )); do
    if "$@"; then
      return 0
    fi

    if (( attempt == max_attempts )); then
      return 1
    fi

    echo "Command failed; retrying in 20s ($attempt/$max_attempts): $*"
    sleep 20
  done
}

helm_release_exists() {
  local namespace="$1"
  local release="$2"

  helm status "$release" --namespace "$namespace" >/dev/null 2>&1
}

deployment_available() {
  local namespace="$1"
  local deployment="$2"

  kubectl -n "$namespace" get deployment "$deployment" \
    -o jsonpath='{.status.conditions[?(@.type=="Available")].status}' 2>/dev/null | grep -q True
}

daemonset_exists() {
  local namespace="$1"
  local daemonset="$2"

  kubectl -n "$namespace" get daemonset "$daemonset" >/dev/null 2>&1
}

echo "Installing namespaces"
kubectl apply -f manifests/foundation/namespaces.yaml

if deployment_available kube-system metrics-server; then
  echo "metrics-server is already installed and available; skipping"
else
  echo "Installing metrics-server"
  helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
  helm repo update metrics-server
  run_with_retries "$HELM_RETRIES" helm upgrade --install metrics-server metrics-server/metrics-server \
    --namespace kube-system \
    --wait \
    --timeout 5m \
    --set args="{--kubelet-insecure-tls}"
fi

if deployment_available ingress-nginx ingress-nginx-controller; then
  echo "ingress-nginx is already installed and available; skipping"
else
  echo "Installing ingress-nginx"
  helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
  helm repo update ingress-nginx
  run_with_retries "$HELM_RETRIES" helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
    --namespace ingress-nginx \
    --create-namespace \
    --wait \
    --timeout 10m \
    --set controller.service.type=LoadBalancer
fi

if deployment_available metallb-system metallb-controller && daemonset_exists metallb-system metallb-speaker; then
  echo "MetalLB Helm release resources are already installed and available; skipping install"
elif deployment_available metallb-system controller && daemonset_exists metallb-system speaker; then
  echo "MetalLB native manifest is already installed and available; skipping install"
else
  echo "Installing MetalLB"
  helm repo add metallb https://metallb.github.io/metallb
  helm repo update metallb
  if ! run_with_retries "$HELM_RETRIES" helm upgrade --install metallb metallb/metallb \
    --namespace metallb-system \
    --create-namespace \
    --wait \
    --timeout 10m; then
    echo "MetalLB Helm install failed; falling back to native manifest $METALLB_VERSION"
    kubectl apply -f "https://raw.githubusercontent.com/metallb/metallb/${METALLB_VERSION}/config/manifests/metallb-native.yaml"
  fi
fi

if deployment_available metallb-system metallb-controller; then
  METALLB_CONTROLLER_DEPLOYMENT=metallb-controller
  METALLB_SPEAKER_DAEMONSET=metallb-speaker
elif deployment_available metallb-system controller; then
  METALLB_CONTROLLER_DEPLOYMENT=controller
  METALLB_SPEAKER_DAEMONSET=speaker
else
  echo "MetalLB controller was not found after install attempt." >&2
  exit 1
fi

echo "Waiting for MetalLB controller"
kubectl rollout status "deployment/${METALLB_CONTROLLER_DEPLOYMENT}" -n metallb-system --timeout=180s
kubectl rollout status "daemonset/${METALLB_SPEAKER_DAEMONSET}" -n metallb-system --timeout=180s

echo "Applying MetalLB address pool: $METALLB_ADDRESS_POOL"
TMP_POOL="$(mktemp)"
envsubst < manifests/foundation/metallb-address-pool.yaml.tpl > "$TMP_POOL"
kubectl apply -f "$TMP_POOL"
rm -f "$TMP_POOL"

if deployment_available cert-manager cert-manager; then
  echo "cert-manager is already installed and available; skipping"
else
  echo "Installing cert-manager"
  helm repo add jetstack https://charts.jetstack.io
  helm repo update jetstack
  if ! run_with_retries "$HELM_RETRIES" helm upgrade --install cert-manager jetstack/cert-manager \
    --namespace cert-manager \
    --create-namespace \
    --wait \
    --timeout 10m \
    --set crds.enabled=true; then
    echo "cert-manager Helm install failed; falling back to static manifest $CERT_MANAGER_VERSION"
    kubectl apply -f "https://github.com/cert-manager/cert-manager/releases/download/${CERT_MANAGER_VERSION}/cert-manager.yaml"
  fi
fi

echo "Waiting for cert-manager"
kubectl rollout status deployment/cert-manager -n cert-manager --timeout=180s
kubectl rollout status deployment/cert-manager-webhook -n cert-manager --timeout=180s
kubectl rollout status deployment/cert-manager-cainjector -n cert-manager --timeout=180s

echo "Applying self-signed ClusterIssuer"
kubectl apply -f manifests/foundation/cert-manager-selfsigned.yaml

if [[ "${DEFAULT_STORAGE:-}" == "local-path" ]]; then
  echo "Installing local-path provisioner"
  kubectl apply -f https://raw.githubusercontent.com/rancher/local-path-provisioner/master/deploy/local-path-storage.yaml
  kubectl patch storageclass local-path -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
fi

echo
echo "Foundation install complete. Verify with:"
echo "kubectl get pods -A"
echo "kubectl get svc -n ingress-nginx"
echo "kubectl get storageclass"
