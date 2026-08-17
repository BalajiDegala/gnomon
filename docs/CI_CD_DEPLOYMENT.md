# Gnomon CI/CD and Kubernetes Operations

This is the operating guide for the Gnomon test deployment. Every Gnomon-specific
manifest, pipeline, helper, and troubleshooting command lives in this repository.
Run all commands from the repository root:

```bash
cd /dd/ayon/git/gnomon
```

The delivery path is:

```text
GitLab univrz/gnomon main
  -> Jenkins tests + SonarQube gate
  -> Harbor immutable images
  -> platform-gitops revision update
  -> Argo CD automated synchronization
  -> Kubernetes namespace gnomon
```

Jenkins does not run Helm or deploy workloads directly. A successful build writes
the tested source SHA to the GitOps repository, and Argo CD performs the deployment.

## Current lab endpoints

| Service           | Address                                                     |
| ----------------- | ----------------------------------------------------------- |
| Gnomon            | `http://gnomon.d2-india.com`                                |
| Jenkins job       | `http://jenkins.d2-india.com/job/gnomon/`                   |
| SonarQube project | `http://sonar.d2-india.com/dashboard?id=gnomon`             |
| Argo CD           | `http://argocd.d2-india.com`                                |
| GitLab source     | `http://gitlab.d2-india.com/univrz/gnomon`                  |
| Harbor project    | `http://harbor.d2-india.com/harbor/projects/2/repositories` |

If workstation DNS does not resolve an endpoint, add the ingress load-balancer
mapping `10.191.0.240 <name>` to the workstation hosts file or ask DNS operations to
create the corresponding record.

## Package-owned delivery files

| File                                        | Purpose                                                    |
| ------------------------------------------- | ---------------------------------------------------------- |
| `Jenkinsfile`                               | Test, SonarQube gate, image publication, and GitOps update |
| `deploy/cicd/lab.env`                       | Non-secret lab configuration                               |
| `deploy/cicd/storage.yaml`                  | Retained MongoDB StorageClass and local PV                 |
| `deploy/cicd/Dockerfile.admin-seed`         | One-time administrator seed image                          |
| `deploy/gitops/gnomon-project.yaml`         | Argo CD project boundary                                   |
| `deploy/gitops/gnomon-application.yaml.tpl` | Revision-pinned Argo CD application                        |
| `deploy/helm/gnomon/`                       | Application Helm chart, values, and templates              |
| `scripts/bootstrap-cicd.py`                 | Idempotent initial setup/recovery automation               |
| `scripts/check-cicd.py`                     | Read-only end-to-end verification                          |

Do not commit credentials to any of these files. `deploy/cicd/lab.env` is deliberately
non-secret.

The shared cluster platform is maintained in `/dd/git/kubee`. Before onboarding
Gnomon, use its demo pipeline and prerequisite guides in
`docs/13-demo-cicd-pipeline.md` and `docs/14-gnomon-cicd-onboarding.md`. This
repository owns the Gnomon delivery files; `/dd/git/kubee` owns the shared GitLab,
Jenkins, Harbor, SonarQube, Argo CD, ingress, and node setup.

## Storage design

MongoDB uses this static local volume:

```text
node: dd-test.d2-india.com
path: /pipedev/k8s-local/gnomon-mongodb
StorageClass: gnomon-local
PV: gnomon-mongodb
claim: data-gnomon-gnomon-mongodb-0
reclaim policy: Retain
capacity: 20Gi
```

This keeps database I/O on the large `/pipedev` XFS filesystem instead of the full
root disk. MongoDB is intentionally not placed directly on shared NFS because its
database files require reliable local filesystem locking and latency. The tradeoff is
that the database is tied to `dd-test`; it is not highly available and the PV is not a
backup. Application/API replicas remain portable across the cluster.

The bootstrap script creates the host directory through a short Kubernetes Job and
applies `deploy/cicd/storage.yaml`. No SSH session and no second repository are needed.

## First deployment or complete rebuild

Prerequisites:

- a working `kubectl` context for the lab cluster;
- GitLab, Jenkins, Harbor, SonarQube, Argo CD, and ingress already running;
- the SonarQube admin password and Jenkins analysis token available either in the
  protected notes file or interactively;
- the GitLab project `univrz/gnomon` and GitOps project `root/platform-gitops` exist.

Validate the helper without changing the cluster:

```bash
python3 -m py_compile scripts/bootstrap-cicd.py scripts/check-cicd.py
helm lint deploy/helm/gnomon
helm lint deploy/helm/gnomon \
  --set-string secrets.existingSecret=gnomon-runtime \
  --set adminSeed.enabled=true
```

Run the complete bootstrap from this package:

```bash
env -u KUBECONFIG scripts/bootstrap-cicd.py \
  deploy/cicd/lab.env \
  --secrets-file /dd/git/kubee/secrets.md
```

The notes path is input only; the script never copies it into this repository. Omit
`--secrets-file` on another installation to enter the two SonarQube values using
hidden prompts.

The bootstrap performs these operations in order:

1. Creates the `gnomon` namespace.
2. Creates `/pipedev/k8s-local/gnomon-mongodb` on the selected storage node through a
   Kubernetes Job, then applies the retained PV.
3. Generates or retains the `gnomon-runtime` Secret. It contains JWT, MongoDB, and
   initial administrator credentials.
4. Creates or reuses the Harbor `apps` project, gives Jenkins a push/pull robot, and
   gives Gnomon a separate pull-only robot.
5. Creates or confirms SonarQube project key `gnomon`.
6. Creates scoped GitLab project access tokens for Jenkins, Argo CD, and GitOps.
7. Stores those credentials in Jenkins/Argo CD and creates or updates Jenkins job
   `gnomon`.
8. Publishes only the package-owned delivery files listed above, including the full
   Helm chart, to GitLab `main` in a single commit. It does not publish unrelated local
   modified/untracked files.
9. Creates or updates the protected GitLab push webhook.
10. Revokes superseded Gnomon bootstrap tokens and the temporary administrator token.
11. Queues the first Jenkins build.

The first deployment therefore builds the application currently committed to GitLab
`main`, plus the package-owned delivery files. Commit and push local application work
separately when it is ready; do not use `git add .` in a dirty worktree.

## Follow the first build

Open the Jenkins job or inspect it without exposing credentials:

```bash
kubectl get pods -n jenkins
kubectl get pods,pvc,job,ingress -n gnomon -w
kubectl get application gnomon -n argocd -w
```

Expected Jenkins stages are:

1. Configure the GitLab trigger.
2. Install locked Node.js dependencies with Node 22.
3. Run formatting, TypeScript checks, tests, and Helm lint validation.
4. Build the production workspaces.
5. Run the pinned SonarQube scanner and require an `OK` quality gate.
6. Build and push `gnomon-api`, `gnomon-web`, and `gnomon-admin-seed`, all tagged with
   the exact Git commit SHA.
7. Commit the SHA-pinned Application into `root/platform-gitops`.

Argo CD then renders the Helm chart from that same SHA. The web, API, and seed image
tags also use that SHA, so an untested chart or image cannot be mixed into a release.
The administrator Job is named with the revision and seeds the idempotent
`admin@d2-india.com` account using the password held in `gnomon-runtime`.

## Verify the complete deployment

After Jenkins completes and Argo CD settles, run:

```bash
env -u KUBECONFIG scripts/check-cicd.py deploy/cicd/lab.env
```

`PASS` verifies all of the following without displaying secret values:

- Argo CD is `Synced` and `Healthy`;
- API and web replicas are Ready and use the Argo revision;
- MongoDB is Ready and its retained PV is Bound;
- the administrator seed Job completed;
- the last Jenkins build succeeded;
- all three revision tags exist in Harbor;
- SonarQube is UP;
- ingress web/API health endpoints return HTTP 200;
- a real administrator login smoke test returns HTTP 200.

Useful manual checks:

```bash
kubectl get application gnomon -n argocd -o wide
kubectl get deploy,statefulset,pod,job,service,ingress,pvc -n gnomon
kubectl get pv gnomon-mongodb
kubectl get events -n gnomon --sort-by=.lastTimestamp
```

## Log in to Gnomon

Open `http://gnomon.d2-india.com`. The initial email is
`admin@d2-india.com`. Retrieve the generated password without placing it in shell
history:

```bash
read -rsp 'Kubernetes secret field: ' secret_field; echo
kubectl get secret gnomon-runtime -n gnomon \
  -o "jsonpath={.data.${secret_field}}" | base64 -d
echo
unset secret_field
```

Enter `ADMIN_PASSWORD` at the prompt. Do not paste the decoded password into this
document, Git, Jenkins logs, chat, or a ticket. Store it in the approved password
manager and rotate it from the Gnomon administration UI after ownership is assigned.

## Normal developer workflow

Before pushing:

```bash
npm ci
npm run format:check
npm run typecheck
npm test
npm run build
helm lint deploy/helm/gnomon
git diff --check
```

Then stage only the intended work:

```bash
git status --short
git add <explicit-files>
git diff --cached --check
git commit -m '<type>: <description>'
git push origin main
```

A push to `main` triggers Jenkins automatically. A failed validation or SonarQube gate
stops before image publication. A failed image build stops before GitOps changes. Only
a fully successful pipeline advances Argo CD.

## Manual Helm fallback

Use the CI/CD bootstrap and GitOps path for normal deployments. A direct Helm install
is only a recovery path when the shared delivery services are unavailable. It needs a
private values file containing the runtime and administrator fields:

```yaml
secrets:
  accessTokenSecret: <random-value-at-least-32-characters>
  refreshTokenSecret: <different-random-value-at-least-32-characters>
  mongodbRootPassword: <random-value>
  mongodbUri: mongodb://gnomonadmin:<password>@gnomon-gnomon-mongodb:27017/gnomon?authSource=admin
  adminEmail: admin@example.com
  adminPassword: <long-initial-password>
  adminEmployeeCode: DDI0001

adminSeed:
  enabled: true
```

Render and validate it without applying first:

```bash
helm lint deploy/helm/gnomon -f private-values.yaml
helm template gnomon deploy/helm/gnomon -f private-values.yaml >/tmp/gnomon-rendered.yaml
```

For a direct install, create the namespace and retained MongoDB PV first, then run:

```bash
kubectl create namespace gnomon --dry-run=client -o yaml | kubectl apply -f -
helm upgrade --install gnomon deploy/helm/gnomon \
  --namespace gnomon \
  --set imagePullSecrets[0].name=harbor-gnomon-registry \
  -f private-values.yaml
```

Do not use a direct Helm install while Argo CD manages the same release. It creates
competing ownership and Argo CD will reconcile over it.

## Synchronization and rollback

Argo CD synchronization is required: it is the controlled step that turns the GitOps
desired state into Kubernetes resources. Automated sync, pruning, and self-healing are
enabled for this test deployment.

Rollback by reverting the source change and pushing the revert, which creates a newly
tested commit and deployment. For an urgent platform-only rollback, revert the Gnomon
change in `root/platform-gitops`; do not edit the live Deployment because Argo CD will
self-heal it back to Git.

```bash
kubectl get application gnomon -n argocd \
  -o jsonpath='{.spec.source.targetRevision}'; echo
kubectl get deploy -n gnomon \
  -o custom-columns=NAME:.metadata.name,IMAGE:.spec.template.spec.containers[*].image
```

## Troubleshooting

### Jenkins checkout or webhook failure

```bash
kubectl get pods -n jenkins
kubectl logs -n jenkins statefulset/jenkins -c jenkins --tail=200
```

Confirm the job SCM is the internal GitLab service and credential ID is
`gitlab-gnomon-read`. Confirm the source webhook targets the Jenkins ClusterIP path
`/project/gnomon`; ClusterIP avoids GitLab's external DNS path. Rerunning the bootstrap
repairs the job, scoped tokens, and webhook.

### Formatting, test, or build failure

Reproduce the exact command locally from the Gnomon root. Jenkins builds GitLab
`main`, not uncommitted local work. Check which SHA Jenkins checked out before comparing
results:

```bash
git rev-parse HEAD
git status --short
```

### SonarQube failure

Distinguish scanner connectivity from a quality-gate rejection in the Jenkins stage.
Check server health and then the project dashboard:

```bash
curl -fsS http://sonar.d2-india.com/api/system/status
```

Do not bypass the gate to make a deployment green. Fix the finding or deliberately
change the project quality-gate policy with an auditable reason.

### Harbor push or ImagePullBackOff

```bash
kubectl describe pod -n gnomon <pod-name>
kubectl get secret harbor-gnomon-registry -n gnomon \
  -o jsonpath='{.type}'; echo
kubectl get secret harbor-cicd-registry -n jenkins \
  -o jsonpath='{.type}'; echo
```

Both types must be `kubernetes.io/dockerconfigjson`. The deployment robot is pull-only;
Jenkins uses a different robot with push/pull permission. Run the bootstrap to rotate
and reinstall missing credentials.

### Argo CD OutOfSync or Degraded

```bash
kubectl describe application gnomon -n argocd
kubectl get appproject gnomon -n argocd -o yaml
kubectl logs -n argocd deployment/argocd-repo-server --tail=200
kubectl get events -n gnomon --sort-by=.lastTimestamp
```

Check that the target revision exists in `univrz/gnomon`, the repository Secret is
healthy, the AppProject permits the source/destination, and the referenced Harbor tags
exist.

### MongoDB Pending, full disk, or crash loop

```bash
kubectl get pv gnomon-mongodb
kubectl get pvc -n gnomon
kubectl describe pvc data-gnomon-gnomon-mongodb-0 -n gnomon
kubectl get pod -n gnomon -l app.kubernetes.io/component=mongodb -o wide
kubectl logs -n gnomon statefulset/gnomon-gnomon-mongodb --tail=200
kubectl debug node/dd-test.d2-india.com -it --image=alpine:3.22 -- \
  chroot /host df -h /pipedev
```

The MongoDB pod must schedule on `dd-test` because the local PV has node affinity.
Never delete `/pipedev/k8s-local/gnomon-mongodb` as a generic cleanup action. `Retain`
means removing the Application/PVC does not erase those files. Deleting application
data requires a separate, explicit data-destruction decision.

### GitLab HTTP 500

Capture the Request ID and inspect matching GitLab logs before deleting any repository
or storage:

```bash
kubectl logs -n gitlab deployment/gitlab-webservice-default -c webservice \
  --since=20m | rg '<request-id>|error|exception'
kubectl logs -n gitlab statefulset/gitlab-gitaly -c gitaly --since=20m
kubectl get pods,pvc -n gitlab
```

Previous lab HTTP 500 errors were infrastructure failures involving object-storage DNS
and node clock skew, not proof of a corrupt repository. Deleting a project does not fix
those causes.

## Rebuild and credential rotation

The bootstrap is idempotent and is the supported repair path:

```bash
env -u KUBECONFIG scripts/bootstrap-cicd.py \
  deploy/cicd/lab.env \
  --secrets-file /dd/git/kubee/secrets.md
```

It retains the database directory/runtime secret, replaces Jenkins/Argo credentials
with new scoped tokens, revokes superseded Gnomon tokens, repairs the webhook/job, and
queues another build. It never prints credential values.

To move storage to another node or path, first stop application writes and take an
application-consistent MongoDB backup. Then update both `deploy/cicd/lab.env` and
`deploy/cicd/storage.yaml`, copy/restore the data, recreate the PV/PVC binding carefully,
and rerun verification. Changing only one file creates an invalid split configuration.

## Security rules

- Never commit passwords, tokens, kubeconfigs, decoded Secrets, or Harbor robot JSON.
- Keep source-read, GitOps-write, registry-push, registry-pull, and Sonar analysis
  identities separate.
- Do not reuse a Linux login password as an application or pipeline password.
- Prefer commit-SHA image tags; do not deploy `latest`.
- Diagnose storage and logs before deleting GitLab, Jenkins, or MongoDB data.
- Treat `gnomon-runtime` and the local MongoDB directory as production-sensitive even
  while this is a test deployment.
