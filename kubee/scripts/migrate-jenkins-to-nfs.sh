#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${1:-config/lab.env}"
CHART_PACKAGE="${2:-}"
OLD_CLAIM="jenkins"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${JENKINS_CHART_VERSION:?Set JENKINS_CHART_VERSION in $ENV_FILE}"
: "${JENKINS_STORAGE_CLASS:?Set JENKINS_STORAGE_CLASS in $ENV_FILE}"
: "${JENKINS_HOME_CLAIM:?Set JENKINS_HOME_CLAIM in $ENV_FILE}"

if [[ -z "$CHART_PACKAGE" ]]; then
  CHART_PACKAGE="/tmp/jenkins-${JENKINS_CHART_VERSION}.tgz"
fi

if [[ ! -f "$CHART_PACKAGE" ]]; then
  helm pull oci://ghcr.io/jenkinsci/helm-charts/jenkins \
    --version "$JENKINS_CHART_VERSION" \
    --destination "$(dirname "$CHART_PACKAGE")"
fi

current_claim="$(
  kubectl get statefulset jenkins -n jenkins \
    -o jsonpath='{.spec.template.spec.volumes[?(@.name=="jenkins-home")].persistentVolumeClaim.claimName}'
)"

if [[ "$current_claim" == "$JENKINS_HOME_CLAIM" ]]; then
  echo "Jenkins already uses $JENKINS_HOME_CLAIM."
  exit 0
fi

if [[ "$current_claim" != "$OLD_CLAIM" ]]; then
  echo "Refusing migration: Jenkins currently uses unexpected claim '$current_claim'." >&2
  exit 1
fi

scripts/render-jenkins-values.sh "$ENV_FILE"

claim_manifest="$(mktemp)"
copy_manifest="$(mktemp)"
trap 'rm -f "$claim_manifest" "$copy_manifest"' EXIT
envsubst '${JENKINS_HOME_CLAIM} ${JENKINS_STORAGE_CLASS}' \
  < manifests/jenkins/jenkins-home-pvc.yaml.tpl >"$claim_manifest"
envsubst '${JENKINS_HOME_CLAIM}' \
  < manifests/jenkins/jenkins-home-copy-job.yaml.tpl >"$copy_manifest"

kubectl apply -f "$claim_manifest"
kubectl wait --for=jsonpath='{.status.phase}'=Bound \
  "pvc/$JENKINS_HOME_CLAIM" -n jenkins --timeout=2m

# Record the old PVC as a retained Helm resource before switching to an
# externally managed claim. This preserves an immediate rollback copy.
helm upgrade jenkins "$CHART_PACKAGE" \
  --namespace jenkins \
  --reuse-values \
  --set-string 'persistence.annotations.helm\.sh/resource-policy=keep' \
  --wait \
  --timeout 10m
kubectl annotate pvc "$OLD_CLAIM" -n jenkins \
  helm.sh/resource-policy=keep --overwrite
rollback_revision="$(
  helm history jenkins -n jenkins -o json \
    | jq -r '[.[] | select(.status == "deployed")][0].revision'
)"

restore_old=true
cutover_started=false
restore_on_error() {
  rc="$?"
  trap - EXIT
  rm -f "$claim_manifest" "$copy_manifest"
  if [[ "$rc" -ne 0 && "$restore_old" == "true" ]]; then
    if [[ "$cutover_started" == "true" ]]; then
      echo "Cutover failed; rolling Helm back to revision $rollback_revision." >&2
      helm rollback jenkins "$rollback_revision" -n jenkins \
        --wait --timeout 10m || true
    fi
    echo "Restarting Jenkins on retained claim $OLD_CLAIM." >&2
    kubectl scale statefulset jenkins -n jenkins --replicas=1 || true
  fi
  exit "$rc"
}
trap 'restore_on_error' EXIT

kubectl scale statefulset jenkins -n jenkins --replicas=0
kubectl wait --for=delete pod/jenkins-0 -n jenkins --timeout=5m

kubectl delete job jenkins-home-copy -n jenkins --ignore-not-found
kubectl apply -f "$copy_manifest"
kubectl wait --for=condition=complete job/jenkins-home-copy \
  -n jenkins --timeout=10m
kubectl logs job/jenkins-home-copy -n jenkins

cutover_started=true
helm upgrade jenkins "$CHART_PACKAGE" \
  --namespace jenkins \
  --values manifests/jenkins/jenkins-values.yaml \
  --wait \
  --timeout 20m

kubectl rollout status statefulset/jenkins -n jenkins --timeout=10m
kubectl get pvc "$OLD_CLAIM" "$JENKINS_HOME_CLAIM" -n jenkins -o wide

live_claim="$(
  kubectl get statefulset jenkins -n jenkins \
    -o jsonpath='{.spec.template.spec.volumes[?(@.name=="jenkins-home")].persistentVolumeClaim.claimName}'
)"
test "$live_claim" = "$JENKINS_HOME_CLAIM"
restore_old=false

echo "Jenkins now uses $JENKINS_HOME_CLAIM; $OLD_CLAIM is retained for rollback."
