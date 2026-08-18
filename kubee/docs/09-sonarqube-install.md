# SonarQube Community Build Lab Install

SonarQube provides static analysis and quality gates for Jenkins pipelines.

This lab deployment uses:

- the official SonarQube Helm chart in Community Build mode
- an explicit PostgreSQL 17 StatefulSet managed by this repository
- persistent 20 GiB volumes for PostgreSQL and SonarQube data
- nginx Ingress at `sonar.d2-india.com`
- Kubernetes Secrets for the JDBC password and monitoring passcode

## Install

```bash
scripts/install-sonarqube-dependencies.sh
scripts/render-sonarqube-values.sh config/lab.env
scripts/install-sonarqube.sh config/lab.env
```

## Watch

The first start can take several minutes while Elasticsearch initializes.

```bash
kubectl get pods,pvc,ingress -n sonarqube
kubectl get pods -n sonarqube -w
```

## Login

```text
URL: http://sonar.d2-india.com
Username: admin
Password: admin
```

SonarQube requires the initial password to be changed immediately.

## Jenkins Integration

1. Create a SonarQube token for the Jenkins service account.
2. Store it as a Secret Text credential in Jenkins.
3. Add `http://sonarqube-sonarqube.sonarqube.svc.cluster.local:9000` as the
   Jenkins SonarQube server URL.
4. Add the SonarQube Scanner tool or use the build system's scanner.
5. Add `waitForQualityGate` after analysis once the webhook is configured.

Community Build does not provide all commercial branch and merge-request
analysis features. The initial platform pipeline will enforce the quality gate
on the main branch and continue to run unit tests on feature branches.

## Gnomon Integration

The Gnomon pipeline uses the official SonarScanner CLI container pinned to
`12.1.0.3233_8.0.1`; it does not require the Jenkins SonarQube plugin. Create a
SonarQube project with key `gnomon`, generate a project-scoped analysis token,
and store it in Jenkins as Secret Text credential `sonarqube-gnomon-token`.

The pipeline reaches SonarQube through:

```text
http://sonarqube-sonarqube.sonarqube.svc.cluster.local:9000
```

After scanning, it reads `.scannerwork/report-task.txt`, waits for the Compute
Engine task through the authenticated REST API, retrieves the quality gate, and
stops before image publication unless the result is `OK`. See
`docs/14-gnomon-cicd-onboarding.md` for the complete setup and troubleshooting
procedure.
