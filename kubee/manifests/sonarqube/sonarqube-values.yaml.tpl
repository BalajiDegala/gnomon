community:
  enabled: true

monitoringPasscodeSecretName: sonarqube-monitoring
monitoringPasscodeSecretKey: passcode

jdbcOverwrite:
  enabled: true
  jdbcUrl: jdbc:postgresql://sonarqube-postgresql.sonarqube.svc.cluster.local:5432/sonarqube
  jdbcUsername: sonarqube
  jdbcSecretName: sonarqube-postgresql
  jdbcSecretPasswordKey: password

service:
  type: ClusterIP

ingress:
  enabled: true
  ingressClassName: nginx
  hosts:
    - name: ${SONAR_HOST}
      path: /

persistence:
  enabled: true
  storageClass: ${DEFAULT_STORAGE}
  accessMode: ReadWriteOnce
  size: 20Gi

resources:
  requests:
    cpu: 500m
    memory: 3Gi
    ephemeral-storage: 2Gi
  limits:
    cpu: 2
    memory: 4Gi
    ephemeral-storage: 10Gi

readinessProbe:
  timeoutSeconds: 10

livenessProbe:
  timeoutSeconds: 10

startupProbe:
  timeoutSeconds: 10

tests:
  enabled: false
