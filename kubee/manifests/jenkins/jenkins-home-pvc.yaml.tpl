apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ${JENKINS_HOME_CLAIM}
  namespace: jenkins
  labels:
    app.kubernetes.io/component: jenkins-controller
    app.kubernetes.io/instance: jenkins
    app.kubernetes.io/name: jenkins
spec:
  accessModes:
    - ReadWriteMany
  resources:
    requests:
      storage: 20Gi
  storageClassName: ${JENKINS_STORAGE_CLASS}
