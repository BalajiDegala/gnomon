pipeline {
  agent {
    kubernetes {
      defaultContainer 'git'
      retries 2
      yaml '''
apiVersion: v1
kind: Pod
spec:
  serviceAccountName: jenkins
  dnsConfig:
    options:
      - name: ndots
        value: "1"
  hostAliases:
    - ip: "10.191.0.240"
      hostnames:
        - harbor.d2-india.com
  containers:
    - name: git
      image: docker.io/alpine/git:2.49.1
      command: ["cat"]
      tty: true
      resources:
        requests:
          cpu: 100m
          memory: 128Mi
    - name: node
      image: docker.io/library/node:22-alpine
      command: ["cat"]
      tty: true
      resources:
        requests:
          cpu: 500m
          memory: 1Gi
        limits:
          cpu: "2"
          memory: 3Gi
    - name: sonar
      image: docker.io/sonarsource/sonar-scanner-cli:12.1.0.3233_8.0.1
      command: ["cat"]
      tty: true
      resources:
        requests:
          cpu: 500m
          memory: 1Gi
        limits:
          cpu: "1"
          memory: 4Gi
    - name: helm
      image: docker.io/alpine/helm:3.17.3
      command: ["cat"]
      tty: true
      resources:
        requests:
          cpu: 100m
          memory: 128Mi
        limits:
          cpu: "1"
          memory: 512Mi
    - name: kaniko-api
      image: gcr.io/kaniko-project/executor:v1.23.2-debug
      command: ["/busybox/cat"]
      tty: true
      volumeMounts:
        - name: harbor-auth
          mountPath: /kaniko/.docker
          readOnly: true
    - name: kaniko-web
      image: gcr.io/kaniko-project/executor:v1.23.2-debug
      command: ["/busybox/cat"]
      tty: true
      volumeMounts:
        - name: harbor-auth
          mountPath: /kaniko/.docker
          readOnly: true
  volumes:
    - name: harbor-auth
      secret:
        secretName: harbor-cicd-registry
        items:
          - key: .dockerconfigjson
            path: config.json
'''
    }
  }

  options {
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    API_IMAGE = 'harbor.d2-india.com/apps/gnomon-api'
    WEB_IMAGE = 'harbor.d2-india.com/apps/gnomon-web'
    ADMIN_SEED_IMAGE = 'harbor.d2-india.com/apps/gnomon-admin-seed'
    GITOPS_URL = 'http://gitlab-webservice-default.gitlab.svc.cluster.local:8181/root/platform-gitops.git'
    SONAR_HOST_URL = 'http://sonarqube-sonarqube.sonarqube.svc.cluster.local:9000'
  }

  stages {
    stage('Configure GitLab trigger') {
      steps {
        withCredentials([string(credentialsId: 'gitlab-gnomon-webhook', variable: 'WEBHOOK_TOKEN')]) {
          script {
            properties([
              disableConcurrentBuilds(),
              buildDiscarder(logRotator(numToKeepStr: '20')),
              pipelineTriggers([
                gitlab(
                  triggerOnPush: true,
                  branchFilterType: 'NameBasedFilter',
                  includeBranchesSpec: 'main',
                  secretToken: WEBHOOK_TOKEN
                )
              ])
            ])
          }
        }
      }
    }

    stage('Install dependencies') {
      steps {
        container('node') {
          sh 'npm ci --fetch-retries=5 --fetch-retry-factor=2 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000'
        }
      }
    }

    stage('Validate') {
      parallel {
        stage('Formatting') {
          steps {
            container('node') {
              sh 'npm run format:check'
            }
          }
        }
        stage('Types') {
          steps {
            container('node') {
              sh 'npm run typecheck'
            }
          }
        }
        stage('Tests') {
          steps {
            container('node') {
              sh 'npm test'
            }
          }
        }
        stage('Helm chart') {
          steps {
            container('helm') {
              sh 'helm lint deploy/helm/gnomon --set-string secrets.existingSecret=gnomon-runtime --set adminSeed.enabled=true'
            }
          }
        }
      }
    }

    stage('Application build') {
      steps {
        container('node') {
          sh 'npm run build'
        }
      }
    }

    stage('SonarQube quality gate') {
      steps {
        sh 'mkdir -p .scannerwork && chmod 0777 .scannerwork'
        withCredentials([string(credentialsId: 'sonarqube-gnomon-token', variable: 'SONAR_TOKEN')]) {
          container('sonar') {
            sh '''
              set -eu
              set +x
              sonar-scanner \
                -Dsonar.host.url="$SONAR_HOST_URL" \
                -Dsonar.token="$SONAR_TOKEN" \
                -Dsonar.projectKey=gnomon \
                -Dsonar.projectName=Gnomon \
                -Dsonar.projectVersion="$GIT_COMMIT" \
                -Dsonar.sourceEncoding=UTF-8 \
                -Dsonar.sources=apps,packages \
                -Dsonar.tests=apps,packages \
                -Dsonar.exclusions='**/node_modules/**,**/dist/**,**/*.test.ts,**/*.spec.ts,apps/web/e2e/**' \
                -Dsonar.test.inclusions='**/*.test.ts,**/*.spec.ts,apps/web/e2e/**'
            '''
          }
          container('node') {
            sh '''
              set -eu
              set +x
              node <<'NODE'
const fs = require('node:fs');

const properties = Object.fromEntries(
  fs.readFileSync('.scannerwork/report-task.txt', 'utf8')
    .trim()
    .split(/\\r?\\n/)
    .map((line) => line.split(/=(.*)/s).slice(0, 2)),
);
const authorization = `Basic ${Buffer.from(`${process.env.SONAR_TOKEN}:`).toString('base64')}`;
const headers = { Authorization: authorization };
const deadline = Date.now() + 300_000;

async function json(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

(async () => {
  let task;
  while (Date.now() < deadline) {
    task = (await json(properties.ceTaskUrl)).task;
    if (task.status === 'SUCCESS') break;
    if (task.status === 'FAILED' || task.status === 'CANCELED') {
      throw new Error(`SonarQube compute task ended with ${task.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if (!task || task.status !== 'SUCCESS') {
    throw new Error('Timed out waiting for SonarQube analysis');
  }
  const qualityUrl = `${properties.serverUrl}/api/qualitygates/project_status?analysisId=${encodeURIComponent(task.analysisId)}`;
  const quality = (await json(qualityUrl)).projectStatus.status;
  console.log(`SonarQube quality gate: ${quality}`);
  if (quality !== 'OK') process.exit(1);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
NODE
            '''
          }
        }
      }
    }

    stage('Build and push images') {
      parallel {
        stage('API image') {
          steps {
            container('kaniko-api') {
              sh '''
                set -eu
                /kaniko/executor \
                  --context "$WORKSPACE" \
                  --dockerfile "$WORKSPACE/apps/api/Dockerfile" \
                  --destination "$API_IMAGE:$GIT_COMMIT" \
                  --insecure \
                  --skip-tls-verify
                /kaniko/executor \
                  --context "$WORKSPACE" \
                  --dockerfile "$WORKSPACE/deploy/cicd/Dockerfile.admin-seed" \
                  --destination "$ADMIN_SEED_IMAGE:$GIT_COMMIT" \
                  --insecure \
                  --skip-tls-verify
              '''
            }
          }
        }
        stage('Web image') {
          steps {
            container('kaniko-web') {
              sh '''
                set -eu
                /kaniko/executor \
                  --context "$WORKSPACE" \
                  --dockerfile "$WORKSPACE/apps/web/Dockerfile" \
                  --destination "$WEB_IMAGE:$GIT_COMMIT" \
                  --insecure \
                  --skip-tls-verify
              '''
            }
          }
        }
      }
    }

    stage('Update GitOps') {
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: 'gitlab-gitops-write',
            usernameVariable: 'GITOPS_USER',
            passwordVariable: 'GITOPS_TOKEN'
          )
        ]) {
          sh '''
            set -eu
            set +x
            askpass="$(mktemp)"
            cleanup() {
              rm -f "$askpass"
            }
            trap cleanup EXIT
            cat >"$askpass" <<'EOF'
#!/bin/sh
case "$1" in
  *Username*) printf '%s' "$GITOPS_USER" ;;
  *Password*) printf '%s' "$GITOPS_TOKEN" ;;
esac
EOF
            chmod 700 "$askpass"
            export GIT_ASKPASS="$askpass"
            export GIT_TERMINAL_PROMPT=0

            rm -rf gitops-work
            git clone "$GITOPS_URL" gitops-work
            mkdir -p gitops-work/clusters/lab/apps
            cp deploy/gitops/gnomon-project.yaml \
              gitops-work/clusters/lab/apps/gnomon-project.yaml
            sed "s|__REVISION__|$GIT_COMMIT|g" \
              deploy/gitops/gnomon-application.yaml.tpl \
              > gitops-work/clusters/lab/apps/gnomon.yaml

            git -C gitops-work config user.name "Jenkins CI"
            git -C gitops-work config user.email "jenkins@d2-india.com"
            git -C gitops-work add clusters/lab/apps/gnomon-project.yaml \
              clusters/lab/apps/gnomon.yaml
            if git -C gitops-work diff --cached --quiet; then
              echo "GitOps already references this Gnomon revision."
            else
              git -C gitops-work commit \
                -m "Deploy Gnomon revision $GIT_COMMIT"
              git -C gitops-work push origin HEAD:main
            fi
          '''
        }
      }
    }
  }
}
