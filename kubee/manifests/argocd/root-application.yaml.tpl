apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: platform-root
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: ${GITOPS_PROJECT}
  source:
    repoURL: ${GITOPS_REPO_URL}
    targetRevision: ${GITOPS_REPO_REVISION}
    path: ${GITOPS_REPO_PATH}
    directory:
      recurse: true
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
      allowEmpty: true
    syncOptions:
      - CreateNamespace=false
      - PruneLast=true
