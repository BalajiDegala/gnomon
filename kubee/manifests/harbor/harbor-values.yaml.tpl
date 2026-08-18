expose:
  type: ingress
  tls:
    enabled: false
  ingress:
    hosts:
      core: ${HARBOR_HOST}
    controller: default
    className: nginx
    annotations:
      nginx.ingress.kubernetes.io/proxy-body-size: "0"

externalURL: http://${HARBOR_HOST}

existingSecretAdminPassword: harbor-admin-password
existingSecretAdminPasswordKey: HARBOR_ADMIN_PASSWORD

persistence:
  enabled: true
  resourcePolicy: keep
  persistentVolumeClaim:
    registry:
      storageClass: ${DEFAULT_STORAGE}
      accessMode: ReadWriteOnce
      size: 40Gi
    jobservice:
      jobLog:
        storageClass: ${DEFAULT_STORAGE}
        accessMode: ReadWriteOnce
        size: 1Gi
    database:
      storageClass: ${DEFAULT_STORAGE}
      accessMode: ReadWriteOnce
      size: 5Gi
    redis:
      storageClass: ${DEFAULT_STORAGE}
      accessMode: ReadWriteOnce
      size: 1Gi
    trivy:
      storageClass: ${DEFAULT_STORAGE}
      accessMode: ReadWriteOnce
      size: 5Gi
  imageChartStorage:
    type: filesystem

updateStrategy:
  type: Recreate

trivy:
  enabled: true
  resources:
    requests:
      cpu: 200m
      memory: 512Mi
    limits:
      cpu: 1
      memory: 1Gi
