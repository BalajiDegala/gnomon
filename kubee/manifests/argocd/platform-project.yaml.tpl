apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: ${GITOPS_PROJECT}
  namespace: argocd
spec:
  description: Applications delivered from the d2-india platform GitOps repository
  sourceRepos:
    - ${GITOPS_REPO_URL}
  destinations:
    - namespace: argocd
      server: https://kubernetes.default.svc
    - namespace: ${GITOPS_APP_NAMESPACE}
      server: https://kubernetes.default.svc
  clusterResourceWhitelist:
    - group: ""
      kind: Namespace
  namespaceResourceWhitelist:
    - group: "*"
      kind: "*"
