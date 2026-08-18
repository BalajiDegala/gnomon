controller:
  admin:
    createSecret: false
    existingSecret: jenkins-admin
    userKey: jenkins-admin-user
    passwordKey: jenkins-admin-password

  serviceType: ClusterIP
  servicePort: 8080
  jenkinsUrlProtocol: http
  numExecutors: 0

  ingress:
    enabled: true
    ingressClassName: nginx
    hostName: ${JENKINS_HOST}
    path: /
    pathType: Prefix
    annotations:
      nginx.ingress.kubernetes.io/proxy-body-size: "50m"

  additionalPlugins:
    - gitlab-plugin
    - credentials-binding
    - pipeline-stage-view
    - ssh-agent
    - docker-workflow

  initializeOnce: true
  overwritePlugins: false

  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: 2
      memory: 4Gi

  JCasC:
    defaultConfig: true

agent:
  enabled: true
  podRetention: Never
  idleMinutes: 5
  resources:
    requests:
      cpu: 200m
      memory: 256Mi
    limits:
      cpu: 2
      memory: 2Gi

persistence:
  enabled: true
  existingClaim: ${JENKINS_HOME_CLAIM}
  storageClass: ${JENKINS_STORAGE_CLASS}
  accessMode: ReadWriteMany
  size: 20Gi

rbac:
  create: true
  readSecrets: false

serviceAccount:
  create: true
