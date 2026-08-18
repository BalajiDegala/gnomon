# Gnomon CI/CD Onboarding

This guide onboards the existing GitLab project `univrz/gnomon` to the same
GitLab -> Jenkins -> Harbor -> GitOps -> Argo CD path proven by `cicd-demo`.

The repository-specific files have already been added locally at:

- `/dd/ayon/git/gnomon/Jenkinsfile`
- `/dd/ayon/git/gnomon/deploy/gitops/gnomon-project.yaml`
- `/dd/ayon/git/gnomon/deploy/gitops/gnomon-application.yaml.tpl`

Matching reference copies are under `examples/gnomon` in this platform
repository. The Gnomon working tree already contained many modified and
untracked application files. Those files were not edited, staged, committed, or
pushed while adding the pipeline.

## Delivery Design

One successful source commit produces two images:

```text
univrz/gnomon@<SHA>
    |-- harbor.d2-india.com/apps/gnomon-api:<SHA>
    |-- harbor.d2-india.com/apps/gnomon-web:<SHA>
    `-- root/platform-gitops/clusters/lab/apps/gnomon.yaml
```

The Argo CD Application pins both `targetRevision` and both image tags to the
same tested SHA. A change to the Helm chart on `main` cannot deploy before its
pipeline succeeds and moves the pinned revision.

Jenkins does not have Kubernetes deployment permission and does not run Helm or
`kubectl apply`. It only tests, builds, publishes, and changes GitOps Git.

## Important Storage Decision

Do not put MongoDB's live database directory on the shared NFS class. MongoDB
uses a static local PersistentVolume at:

```text
dd-test.d2-india.com:/pipedev/k8s-local/gnomon-mongodb
```

This uses the large `/pipedev` XFS disk directly and avoids the almost-full
worker root disk, while preserving database filesystem semantics. It is still a
single-node volume, not high availability and not a backup. Use `mongodump` to a
separate NFS-backed backup claim or external object store.

The web and API replicas are stateless and can run on either worker. Jenkins
home remains on `nfs-shared`.

## 1. Review and Validate the Local Repository

```bash
cd /dd/ayon/git/gnomon
git status --short
git diff --check
npm ci
npm run format:check
npm run typecheck
npm test
npm run build
```

Node.js 22 or newer is required. Resolve application test failures before
publishing the pipeline. The Jenkinsfile deliberately enforces the same checks.

Review only the new delivery files:

```bash
git diff --no-index /dev/null Jenkinsfile || true
git diff --no-index /dev/null deploy/gitops/gnomon-project.yaml || true
git diff --no-index /dev/null deploy/gitops/gnomon-application.yaml.tpl || true
```

Do not use `git add .` in the currently dirty tree. Commit existing application
work in logical slices according to the repository's own README, then stage the
delivery files explicitly.

## 2. Verify the GitLab Remote Safely

The local repository has been changed so GitLab is the primary `origin`. The
previous GitHub URL is preserved as the `github` remote:

```bash
git remote -v
git fetch origin main
git log --oneline --left-right --graph main...origin/main
```

Expected remotes:

```text
origin  http://gitlab.d2-india.com/univrz/gnomon.git
github  git@github.com:BalajiDegala/gnomon.git
```

If Git reports unrelated histories or unexpected commits, stop and reconcile
them; do not force-push over the existing GitLab project.

Commit the new files after the application tree is in the intended state:

```bash
git add Jenkinsfile \
  deploy/gitops/gnomon-project.yaml \
  deploy/gitops/gnomon-application.yaml.tpl
git diff --cached --check
git commit -m "ci: add Gnomon Kubernetes delivery pipeline"
git push --set-upstream origin main
```

Git may prompt for GitLab credentials. Use a personal/project token with the
minimum repository write scope, not the GitLab root password.

## 3. Prepare the MongoDB Volume

First verify `/pipedev` is the dedicated XFS disk on `dd-test`:

```bash
ssh dd-test.d2-india.com
findmnt -T /pipedev
df -h /pipedev
sudo install -d -m 0755 /pipedev/k8s-local/gnomon-mongodb
exit
```

Then apply the static class and retained PV from the platform workspace:

```bash
cd /dd/git/kubee
kubectl apply -f manifests/gnomon/storage.yaml
kubectl get storageclass gnomon-local
kubectl get pv gnomon-mongodb
```

Expected PV state before first deployment is `Available`. Do not apply this
manifest over a different PV with the same name. The `Retain` policy prevents
automatic data deletion if the claim is removed.

## 4. Create the Namespace and Runtime Secret

Create the namespace before Argo CD so secrets are ready for the first pods:

```bash
kubectl create namespace gnomon --dry-run=client -o yaml | kubectl apply -f -
```

Generate new values into a protected temporary directory. This avoids putting
secrets in the Git repository or command history:

```bash
set +x
runtime_dir="$(mktemp -d)"
chmod 700 "$runtime_dir"
openssl rand -hex 32 >"$runtime_dir/ACCESS_TOKEN_SECRET"
openssl rand -hex 32 >"$runtime_dir/REFRESH_TOKEN_SECRET"
openssl rand -hex 24 >"$runtime_dir/MONGO_INITDB_ROOT_PASSWORD"
mongo_password="$(tr -d '\n' <"$runtime_dir/MONGO_INITDB_ROOT_PASSWORD")"
printf 'mongodb://gnomonadmin:%s@gnomon-gnomon-mongodb:27017/gnomon?authSource=admin' \
  "$mongo_password" >"$runtime_dir/MONGODB_URI"

kubectl create secret generic gnomon-runtime -n gnomon \
  --from-file=ACCESS_TOKEN_SECRET="$runtime_dir/ACCESS_TOKEN_SECRET" \
  --from-file=REFRESH_TOKEN_SECRET="$runtime_dir/REFRESH_TOKEN_SECRET" \
  --from-file=MONGO_INITDB_ROOT_PASSWORD="$runtime_dir/MONGO_INITDB_ROOT_PASSWORD" \
  --from-file=MONGODB_URI="$runtime_dir/MONGODB_URI" \
  --dry-run=client -o yaml | kubectl apply -f -

unset mongo_password
rm -f "$runtime_dir/ACCESS_TOKEN_SECRET" \
  "$runtime_dir/REFRESH_TOKEN_SECRET" \
  "$runtime_dir/MONGO_INITDB_ROOT_PASSWORD" \
  "$runtime_dir/MONGODB_URI"
rmdir "$runtime_dir"
```

Back up `gnomon-runtime` only through the encrypted cluster-secret backup
process. Never put its decoded values in `values.yaml`, `secrets.md`, Jenkins
console output, or GitLab variables.

## 5. Create Harbor Credentials

The Jenkins namespace already has `harbor-cicd-registry`, scoped to push and
pull repositories in Harbor project `apps`. The Gnomon Jenkinsfile uses it to
publish `gnomon-api` and `gnomon-web`.

In the Harbor UI:

1. Open project `apps`.
2. Create a project robot named for Gnomon deployment.
3. Grant repository `pull` only.
4. Set a controlled expiry and save the generated robot name/secret in the
   password manager.

Apply it interactively without displaying its value:

```bash
cd /dd/git/kubee
scripts/configure-registry-secret.py \
  gnomon harbor-gnomon-registry harbor.d2-india.com
```

Check only metadata:

```bash
kubectl get secret harbor-gnomon-registry -n gnomon \
  -o jsonpath='{.type}'; echo
```

The type must be `kubernetes.io/dockerconfigjson`. If rebuilding this platform
from zero, also create a separate Harbor robot with `pull` and `push` for
Jenkins and apply it as `jenkins/harbor-cicd-registry` with the same helper.

## 6. Give Argo CD Read-Only Source Access

Gnomon is a private source repository, and the child Application renders its
Helm chart directly from the tested source SHA. In GitLab, create a project
deploy token on `univrz/gnomon` with only `read_repository`.

Configure it interactively:

```bash
cd /dd/git/kubee
scripts/configure-argocd-source-repository.sh \
  config/lab.env \
  http://gitlab.d2-india.com/univrz/gnomon.git \
  gnomon-source-repository
```

Confirm only the Secret name and repository-server health:

```bash
kubectl get secret gnomon-source-repository -n argocd
kubectl get pods -n argocd
```

Do not reuse Jenkins' write token here. Argo CD needs read-only access.

## 7. Create the SonarQube Project and Token

SonarQube is live at `http://sonar.d2-india.com`; its server status was `UP`
when this guide was written. Log in with the administrator credential from the
password manager, not from a pipeline.

1. Create a local project with key `gnomon` and name `Gnomon`.
2. Set `main` as the main branch.
3. Assign the intended quality gate. Start with the built-in gate; make changes
   deliberately because a failed gate blocks image publication.
4. Generate a **project analysis token** for Jenkins with access only to
   `gnomon`.
5. Save it in the password manager.

The Jenkinsfile uses the official scanner image pinned to
`12.1.0.3233_8.0.1` and the internal server URL
`http://sonarqube-sonarqube.sonarqube.svc.cluster.local:9000`. It polls the
SonarQube REST API for up to five minutes and fails unless the gate result is
`OK`; the Jenkins SonarQube plugin is not required.

The existing general Jenkins token recorded in the local password notes should
not become the permanent Gnomon token if a project-scoped token can be used.

## 8. Create the Jenkins Credentials

Open `http://jenkins.d2-india.com`, then go to:

**Manage Jenkins > Credentials > System > Global credentials**

Create or confirm these IDs exactly:

| ID                       | Kind                   | Source and permission                                                |
| ------------------------ | ---------------------- | -------------------------------------------------------------------- |
| `gitlab-gnomon-read`     | Username with password | GitLab deploy token on `univrz/gnomon`, `read_repository` only       |
| `gitlab-gnomon-webhook`  | Secret text            | New random webhook token                                             |
| `gitlab-gitops-write`    | Username with password | Existing project token on `root/platform-gitops`, `write_repository` |
| `sonarqube-gnomon-token` | Secret text            | SonarQube project analysis token for project `gnomon`                |

Generate the webhook token outside browser history, place it in the password
manager, and paste the same value into Jenkins and GitLab:

```bash
openssl rand -hex 32
```

The displayed value is a secret. Clear the terminal scrollback after storing
it. Do not add Harbor credentials through the Jenkins UI; Kaniko reads the
namespace-scoped Kubernetes Secret.

## 9. Create the Jenkins Pipeline Job

In Jenkins:

1. Select **New Item**.
2. Name it `gnomon`.
3. Choose **Pipeline**.
4. Under **Pipeline**, choose **Pipeline script from SCM**.
5. SCM: **Git**.
6. Repository URL:
   `http://gitlab-webservice-default.gitlab.svc.cluster.local:8181/univrz/gnomon.git`
7. Credentials: `gitlab-gnomon-read`.
8. Branch specifier: `*/main`.
9. Script path: `Jenkinsfile`.
10. Enable lightweight checkout and save.

The internal Service URL avoids the cluster DNS limitation affecting the
external `d2-india.com` record. Run **Build Now** once. The first successful
stage installs the token-protected GitLab trigger on the Jenkins job.

Expected stages:

1. Configure GitLab trigger.
2. `npm ci` with Node 22.
3. Formatting, type checking, and tests in parallel.
4. Production application build.
5. SonarQube analysis and mandatory quality gate.
6. API and web Kaniko builds in parallel.
7. Push both commit-SHA tags to Harbor.
8. Commit the pinned Argo CD AppProject/Application to `platform-gitops`.

Playwright E2E is intentionally not in the first pipeline because it requires
a browser image and a running test environment. Add it as a separate pre-release
stage after the base pipeline is stable.

## 10. Configure the GitLab Webhook

In `univrz/gnomon`, open **Settings > Webhooks** and add:

```text
URL: http://jenkins.jenkins.svc.cluster.local:8080/project/gnomon
Trigger: Push events
Branch filter: main
Secret token: the value stored as gitlab-gnomon-webhook
SSL verification: disabled, because this endpoint is internal HTTP
```

GitLab administrator settings must allow local requests from webhooks and
services. This is already enabled in the lab by the demo bootstrap. On a fresh
GitLab installation, enable it before testing.

Use GitLab's **Test > Push events** after the first manual Jenkins build. A
successful response and a new Jenkins build prove the webhook path.

## 11. First Deployment

The successful Jenkins build adds these objects to `root/platform-gitops`:

- `clusters/lab/apps/gnomon-project.yaml`
- `clusters/lab/apps/gnomon.yaml`

The root Argo CD application discovers them automatically. Watch:

```bash
kubectl get appproject,application -n argocd -w
kubectl get pods,pvc,ingress -n gnomon -w
```

Then verify:

```bash
kubectl get application gnomon -n argocd -o wide
kubectl get deployment,statefulset,pod,service,ingress,pvc -n gnomon
kubectl get pv gnomon-mongodb
kubectl get deployment -n gnomon \
  -o custom-columns=NAME:.metadata.name,IMAGE:.spec.template.spec.containers[0].image
curl --fail --resolve gnomon.d2-india.com:80:10.191.0.240 \
  http://gnomon.d2-india.com/healthz
curl --fail --resolve gnomon.d2-india.com:80:10.191.0.240 \
  http://gnomon.d2-india.com/api/v1/health/ready
```

Both images must end in the same 40-character Git SHA and the Application must
be `Synced/Healthy`.

Access the application at `http://gnomon.d2-india.com`. Add this record to DNS
or the client hosts file if necessary:

```text
10.191.0.240  gnomon.d2-india.com
```

## 12. Seed the First Administrator

The current runtime image starts the API but does not automatically create an
administrator. Run the source repository's idempotent seed script through a
temporary local MongoDB port-forward.

Terminal 1:

```bash
kubectl port-forward -n gnomon service/gnomon-gnomon-mongodb 27018:27017
```

Terminal 2, from `/dd/ayon/git/gnomon`:

```bash
set +x
mongo_password="$(kubectl get secret gnomon-runtime -n gnomon \
  -o jsonpath='{.data.MONGO_INITDB_ROOT_PASSWORD}' | base64 --decode)"
access_secret="$(kubectl get secret gnomon-runtime -n gnomon \
  -o jsonpath='{.data.ACCESS_TOKEN_SECRET}' | base64 --decode)"
refresh_secret="$(kubectl get secret gnomon-runtime -n gnomon \
  -o jsonpath='{.data.REFRESH_TOKEN_SECRET}' | base64 --decode)"
read -r -p 'Administrator email: ' admin_email
read -r -s -p 'Administrator password (12+ characters): ' admin_password
echo

export NODE_ENV=production
export MONGODB_URI="mongodb://gnomonadmin:${mongo_password}@127.0.0.1:27018/gnomon?authSource=admin"
export ACCESS_TOKEN_SECRET="$access_secret"
export REFRESH_TOKEN_SECRET="$refresh_secret"
export ADMIN_EMAIL="$admin_email"
export ADMIN_PASSWORD="$admin_password"
export ADMIN_EMPLOYEE_CODE=DDI0001
npm run seed:admin --workspace @gnomon/api

unset mongo_password access_secret refresh_secret admin_email admin_password
unset NODE_ENV MONGODB_URI ACCESS_TOKEN_SECRET REFRESH_TOKEN_SECRET
unset ADMIN_EMAIL ADMIN_PASSWORD ADMIN_EMPLOYEE_CODE
```

Stop the port-forward with `Ctrl-C`, log in, and change/rotate the administrator
credential according to the application policy. Do not seed demo users in a
real environment.

## 13. Day-Two Workflow

For every application change:

1. Work on a feature branch.
2. Run the local validations.
3. Open and review a merge request into `main`.
4. Merge to `main`.
5. Confirm the GitLab webhook started Jenkins.
6. Confirm both Harbor images were published under the merge SHA.
7. Confirm Jenkins updated GitOps.
8. Confirm Argo CD and both API/web rollouts are healthy.
9. Run a login and health smoke test.

Do not publish mutable `latest` tags and do not manually edit the live
Deployments.

## Rollback

1. Find the previous successful Jenkins source SHA.
2. Confirm both `gnomon-api:<SHA>` and `gnomon-web:<SHA>` exist in Harbor.
3. Edit `clusters/lab/apps/gnomon.yaml` in `root/platform-gitops` so
   `targetRevision` and both image tags use that same SHA.
4. Commit and push the rollback.
5. Wait for Argo CD to become `Synced/Healthy`.
6. Verify API health, web health, and login.

Application rollback does not roll back MongoDB data. Schema/data migrations
must be backward compatible or have a separately tested database restore plan.

## Backup

The retained PV protects against accidental PVC deletion but is not a backup.
Schedule authenticated `mongodump` output to a separate NFS-backed backup claim
or object store, encrypt it, define retention, and perform restore tests. Never
copy `/data/db` while MongoDB is running and call that a consistent backup.

## Troubleshooting

### Jenkins cannot clone Gnomon

Confirm the job uses the internal GitLab URL and `gitlab-gnomon-read`. The
deploy token needs `read_repository`, must be unexpired, and its generated
username—not a person's username—must be stored with the token.

### Build fails at `npm ci`

The agent uses Node 22 and the committed `package-lock.json`. Reproduce with
Node 22 locally. Commit lockfile changes together with dependency changes.

### Formatting, type, or test stage fails

Run the exact command printed by Jenkins from the repository root. The three
checks run in parallel but share only the read-mostly source and installed
`node_modules` in the ephemeral workspace.

### SonarQube analysis or quality gate fails

```bash
kubectl get pods -n sonarqube
curl --fail http://sonar.d2-india.com/api/system/status
kubectl describe pod -n jenkins JENKINS_AGENT_POD
```

Open project `gnomon` in SonarQube and inspect the analysis and gate conditions.
Confirm Jenkins credential `sonarqube-gnomon-token` exists and is a valid
project analysis token. A gate failure is an intentional release stop; fix the
finding or review the gate with the code-quality owner rather than bypassing the
stage. If `.scannerwork` reports a permission error, confirm the Jenkinsfile
creates it with write access before entering the scanner container.

### Kaniko cannot push

```bash
kubectl get secret harbor-cicd-registry -n jenkins
kubectl describe pod -n jenkins JENKINS_AGENT_POD
```

Verify the Harbor robot has both `pull` and `push` in project `apps`, and that
the node trusts the current HTTP registry configuration.

### Argo CD says repository not permitted or authentication failed

```bash
kubectl get appproject gnomon -n argocd -o yaml
kubectl get secret gnomon-source-repository -n argocd
kubectl logs -n argocd deployment/argocd-repo-server --tail=200
```

The AppProject and repository Secret URLs must exactly match
`http://gitlab.d2-india.com/univrz/gnomon.git`.

### MongoDB PVC is Pending

```bash
kubectl describe pvc -n gnomon
kubectl get pv gnomon-mongodb -o wide
kubectl describe pod -n gnomon -l app.kubernetes.io/component=mongodb
```

Confirm the PV is `Available` or bound to the expected claim, the class is
`gnomon-local`, the directory exists on `dd-test`, and the node is Ready. A
retained `Released` PV requires a deliberate recovery decision; do not delete
its data directory to make the status disappear.

### API is not Ready

```bash
kubectl logs -n gnomon deployment/gnomon-gnomon-api --tail=200
kubectl get secret gnomon-runtime -n gnomon
kubectl get pods -n gnomon -l app.kubernetes.io/component=mongodb
```

The most common causes are an incorrect `MONGODB_URI`, mismatch between the URI
password and `MONGO_INITDB_ROOT_PASSWORD`, or MongoDB not yet Ready.

### Browser hostname does not resolve

Point `gnomon.d2-india.com` to `10.191.0.240` in corporate DNS or the client
hosts file. Use `curl --resolve` to distinguish DNS failure from application or
Ingress failure.
