apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: gnomon
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: gnomon
  source:
    repoURL: http://gitlab.d2-india.com/univrz/gnomon.git
    targetRevision: __REVISION__
    path: deploy/helm/gnomon
    helm:
      parameters:
        - name: web.image.repository
          value: harbor.d2-india.com/apps/gnomon-web
        - name: web.image.tag
          value: __REVISION__
        - name: web.replicaCount
          value: '2'
        - name: api.image.repository
          value: harbor.d2-india.com/apps/gnomon-api
        - name: api.image.tag
          value: __REVISION__
        - name: api.replicaCount
          value: '2'
        - name: api.webOrigin
          value: http://gnomon.d2-india.com
        - name: imagePullSecrets[0].name
          value: harbor-gnomon-registry
        - name: mongodb.storageClassName
          value: gnomon-local
        - name: mongodb.storage
          value: 20Gi
        - name: ingress.host
          value: gnomon.d2-india.com
        - name: secrets.existingSecret
          value: gnomon-runtime
  destination:
    server: https://kubernetes.default.svc
    namespace: gnomon
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - PruneLast=true
