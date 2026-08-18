apiVersion: batch/v1
kind: Job
metadata:
  name: jenkins-home-copy
  namespace: jenkins
spec:
  backoffLimit: 0
  ttlSecondsAfterFinished: 86400
  template:
    metadata:
      labels:
        app.kubernetes.io/name: jenkins-home-copy
    spec:
      restartPolicy: Never
      nodeSelector:
        kubernetes.io/hostname: hb-ws-pp05
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
        fsGroup: 1000
        fsGroupChangePolicy: OnRootMismatch
      containers:
        - name: copy
          image: docker.io/jenkins/jenkins:2.568.2-jdk21
          imagePullPolicy: IfNotPresent
          command:
            - sh
            - -c
            - |
              set -eu
              source_files="$(find /source -xdev -type f | wc -l)"
              source_hash="$(
                cd /source
                find . -xdev -type f -print0 |
                  sort -z |
                  xargs -0 -r sha256sum |
                  sha256sum |
                  awk '{print $1}'
              )"
              # Copy the contents, not the source mount root itself. NFS
              # root-squash correctly prevents changing the provisioned
              # directory's owner/timestamp.
              find /source -mindepth 1 -maxdepth 1 \
                -exec cp -a --no-preserve=ownership -t /target -- {} +
              sync
              target_files="$(find /target -xdev -type f | wc -l)"
              target_hash="$(
                cd /target
                find . -xdev -type f -print0 |
                  sort -z |
                  xargs -0 -r sha256sum |
                  sha256sum |
                  awk '{print $1}'
              )"
              test "$source_files" -eq "$target_files"
              test "$source_hash" = "$target_hash"
              printf 'Jenkins home copied and hashed: files=%s sha256=%s\n' \
                "$target_files" "$target_hash"
          volumeMounts:
            - name: source
              mountPath: /source
              readOnly: true
            - name: target
              mountPath: /target
      volumes:
        - name: source
          persistentVolumeClaim:
            claimName: jenkins
            readOnly: true
        - name: target
          persistentVolumeClaim:
            claimName: ${JENKINS_HOME_CLAIM}
