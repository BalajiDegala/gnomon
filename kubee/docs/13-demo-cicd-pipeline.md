# End-to-End Demo CI/CD Pipeline

## Result

The lab now has a working reference pipeline:

```text
GitLab push
    -> authenticated webhook
    -> Jenkins ephemeral Kubernetes agent
    -> test
    -> Kaniko image build
    -> immutable Harbor tag
    -> Jenkins commit to platform-gitops
    -> Argo CD reconciliation
    -> Kubernetes Deployment and Ingress
```

Verified state on 2026-08-17:

| Check | Result |
| --- | --- |
| GitLab project | `root/cicd-demo`, `main`, public for this disposable example |
| GitLab webhook | A real push started Jenkins build 3 |
| Jenkins | Builds 3, 4, and 5 completed `SUCCESS` |
| Harbor | `apps/cicd-demo` contains the commit-SHA image |
| GitOps | Jenkins updated `root/platform-gitops` |
| Argo CD | `platform-root` and `cicd-demo` are `Synced` and `Healthy` |
| Kubernetes | Two `cicd-demo` replicas are Ready |
| Image pull | A forced pull with the deployment's pull-only robot succeeded |
| HTTP | The expected page returned through `10.191.0.240` |

Run the credential-safe check at any time:

```bash
env -u KUBECONFIG scripts/check-demo-cicd.py config/lab.env
```

The final line must be:

```text
CI/CD verification: PASS (no credential values displayed)
```

## Access

| Component | URL |
| --- | --- |
| Demo application | `http://cicd-demo.d2-india.com` |
| Source | `http://gitlab.d2-india.com/root/cicd-demo` |
| Jenkins job | `http://jenkins.d2-india.com/job/cicd-demo/` |
| Harbor repository | `http://harbor.d2-india.com/harbor/projects/` then `apps/cicd-demo` |
| Argo CD application | `https://argocd.d2-india.com/applications/argocd/cicd-demo` |

The LAN records must resolve to the ingress address. Until corporate DNS has
them, add these entries to the client machine's hosts file:

```text
10.191.0.240 gitlab.d2-india.com
10.191.0.240 harbor.d2-india.com
10.191.0.240 jenkins.d2-india.com
10.191.0.240 argocd.d2-india.com
10.191.0.240 cicd-demo.d2-india.com
```

Test without changing local DNS:

```bash
curl --fail --resolve cicd-demo.d2-india.com:80:10.191.0.240 \
  http://cicd-demo.d2-india.com/
```

## Repository Files

| File | Purpose |
| --- | --- |
| `demo-app/Jenkinsfile` | Pipeline and ephemeral agent definition |
| `demo-app/Dockerfile` | Builds the static NGINX image |
| `demo-app/tests/smoke.sh` | Source-level test |
| `demo-app/deploy/argocd-application.yaml` | Child Argo CD Application |
| `demo-app/deploy/deployment.yaml.tpl` | Image-SHA deployment template |
| `demo-app/deploy/service.yaml` | ClusterIP Service |
| `demo-app/deploy/ingress.yaml` | External route |
| `scripts/bootstrap-demo-cicd.py` | Idempotent live setup and credential rotation |
| `scripts/check-demo-cicd.py` | Read-only end-to-end health check |
| `scripts/configure-containerd-harbor.sh` | Node trust for the current HTTP registry |

`secrets.md` is deliberately not read by these scripts. Live administrator
credentials are read directly from Kubernetes Secrets and are never printed.
The local `secrets.md` is mode `0600` and ignored by Git.

## Fresh Setup

### 1. Confirm prerequisites

GitLab, Harbor, Jenkins, Argo CD, ingress-nginx, and the GitOps repository must
already be healthy:

```bash
kubectl get nodes
kubectl get pods -n gitlab
kubectl get pods -n harbor
kubectl get pods,pvc -n jenkins
kubectl get applications -n argocd
```

Jenkins home is the `jenkins-home-nfs` RWX claim on `nfs-shared`. The old
local-path claim named `jenkins` remains retained for rollback and must not be
deleted until its retention period is explicitly closed.

### 2. Configure every node for the HTTP Harbor endpoint

This is needed while Harbor is not using a node-trusted TLS certificate:

```bash
sudo scripts/configure-containerd-harbor.sh config/lab.env
```

Run it on the control plane and every worker. It writes containerd's per-host
registry configuration and restarts containerd. Existing containers remain
running, but always check the node afterward:

```bash
sudo systemctl is-active containerd
kubectl get nodes
kubectl get pods -A
```

The long-term correction is HTTPS with an internal CA trusted by every node and
CI image. Remove insecure-registry settings after that migration.

### 3. Bootstrap the demo

Review the `CICD_*` settings in `config/lab.env`, then run:

```bash
env -u KUBECONFIG scripts/bootstrap-demo-cicd.py config/lab.env
```

The helper performs these operations:

1. Creates or reuses the private Harbor project `apps`.
2. Creates or reuses a Jenkins robot with repository `pull` and `push`.
3. Creates a separate deployment robot with only `pull`.
4. Applies `jenkins/harbor-cicd-registry` and
   `demo/harbor-cicd-registry` without printing their data.
5. Creates or updates the GitLab source project and demo files.
6. Creates a one-year, repository-scoped GitOps write token.
7. Stores that token in Jenkins as `gitlab-gitops-write`.
8. Stores a random webhook secret as `gitlab-cicd-webhook`.
9. Creates or updates the Jenkins SCM Pipeline job.
10. Enables GitLab local webhook delivery and configures the project webhook.
11. Revokes the prior bootstrap GitOps token after the replacement is stored.
12. Queues a validation build.
13. Revokes its one-day temporary GitLab administrator token in all exit paths.

Do not interrupt the helper merely because it is quiet. GitLab Rails token
creation can take approximately two minutes on this lab.

### 4. Follow the first build

```bash
kubectl get pods -n jenkins -w
```

Open the job in Jenkins or inspect the masked controller-side log:

```bash
kubectl exec -n jenkins jenkins-0 -c jenkins -- \
  tail -n 200 /var/jenkins_home/jobs/cicd-demo/builds/BUILD_NUMBER/log
```

The expected stages are:

1. Configure the token-protected GitLab trigger.
2. Run `tests/smoke.sh`.
3. Build and push `harbor.d2-india.com/apps/cicd-demo:<Git SHA>` with Kaniko.
4. Update the separate GitOps repository with the same immutable SHA.

Jenkins never runs `kubectl apply` for the application.

### 5. Verify delivery

```bash
env -u KUBECONFIG scripts/check-demo-cicd.py config/lab.env
kubectl get application cicd-demo -n argocd
kubectl get all,ingress -n demo
```

## Normal Developer Flow

1. Change the source in `root/cicd-demo` on branch `main`.
2. Push to GitLab.
3. GitLab signs the webhook request with the configured secret.
4. Jenkins checks out that commit and runs the tests.
5. Only a successful build publishes the commit-SHA image.
6. Jenkins commits the new SHA to `root/platform-gitops`.
7. Argo CD detects the GitOps commit and reconciles the Deployment.
8. Confirm the Jenkins build and Argo CD application are both healthy.

The image tag is a Git commit, never `latest`. Do not edit the live Deployment
to change images; Argo CD self-heal will correctly restore the Git state.

## Credentials and Rotation

Credential names are safe to document; values are not:

| Location | Name | Permission |
| --- | --- | --- |
| Jenkins credential store | `gitlab-gitops-write` | `write_repository` on only `root/platform-gitops` |
| Jenkins credential store | `gitlab-cicd-webhook` | Random webhook secret |
| `jenkins` namespace | `harbor-cicd-registry` | Harbor `apps` pull/push robot |
| `demo` namespace | `harbor-cicd-registry` | Harbor `apps` pull-only robot |
| `argocd` namespace | `platform-gitops-repository` | GitLab `read_repository` |

Rerunning the bootstrap rotates the GitOps write token, preserves valid Harbor
robots, updates the webhook, and queues a build. Rotate immediately after any
suspected disclosure. For Harbor rotation, remove the relevant Kubernetes
registry Secret and rerun the bootstrap; revoke the old robot in Harbor after
the replacement build/pull succeeds.

Never use the GitLab root password, Harbor admin password, or Jenkins admin
password as a pipeline credential.

## Rollback

Rollback is a Git operation:

1. Find the last known-good image SHA in Jenkins or Harbor.
2. Revert the GitOps commit that changed `apps/cicd-demo/deployment.yaml`, or
   replace its image tag with that SHA in a new commit.
3. Push to `root/platform-gitops/main`.
4. Wait for `cicd-demo` to become `Synced/Healthy`.
5. Verify the endpoint and record the reason for rollback.

Do not retag or overwrite an existing SHA. A database rollback, if an
application later adds a database, requires a separate migration/restore plan.

## Troubleshooting

### GitLab push does not start Jenkins

```bash
kubectl get service jenkins -n jenkins
kubectl logs -n jenkins jenkins-0 -c jenkins --tail=200
```

In GitLab, inspect **Settings > Webhooks > Recent events**. The URL must be the
Jenkins ClusterIP endpoint ending in `/project/cicd-demo`; local webhook
requests must be allowed. Run one manual build after creating the job so the
Jenkinsfile can install its trigger property.

### Jenkins agent is Pending

```bash
kubectl get pods -n jenkins -o wide
kubectl describe pod -n jenkins AGENT_POD
kubectl get events -n jenkins --sort-by=.lastTimestamp | tail -n 50
```

Check image pulls, node capacity, the Jenkins service account, and the presence
of `jenkins/harbor-cicd-registry`.

### Kaniko push is unauthorized

```bash
kubectl get secret harbor-cicd-registry -n jenkins \
  -o jsonpath='{.type}'; echo
curl -I http://harbor.d2-india.com/v2/
```

The Secret type must be `kubernetes.io/dockerconfigjson`; Harbor `/v2/` should
return `401`, proving that the registry endpoint itself is reachable. Check the
robot is enabled and has repository `push` in project `apps`.

### Deployment cannot pull the image

```bash
kubectl describe pod -n demo POD_NAME
kubectl get secret harbor-cicd-registry -n demo
sudo scripts/configure-containerd-harbor.sh config/lab.env
```

Run the containerd helper on the node named in the Pod event. The deployment
robot requires only `pull`.

### Argo CD does not deploy the GitOps commit

```bash
kubectl describe application platform-root -n argocd
kubectl describe application cicd-demo -n argocd
kubectl logs -n argocd deployment/argocd-repo-server --tail=200
kubectl logs -n argocd statefulset/argocd-application-controller --tail=200
```

Confirm the root Application revision changed, the child file is under
`clusters/lab/apps`, and the repository credential has not expired.

### Jenkins reports failure after all delivery stages passed

Do not use `deleteDir()` on this ephemeral multi-container agent. Git and
Kaniko may create root-owned files while the Jenkins remoting process runs as a
different UID. The pod uses `emptyDir`, so Kubernetes removes the complete
workspace with the agent pod. An older pipeline revision failed only during
redundant cleanup even though its image and GitOps commit succeeded.

### GitLab project pages return HTTP 500

First inspect GitLab logs and Gitaly, then confirm cluster time:

```bash
scripts/check-cluster-time.sh config/lab.env
kubectl logs -n gitlab statefulset/gitlab-gitaly --tail=200
```

This lab previously returned a Gitaly token-validity error because the newly
joined node's clock differed from the existing node. See
`docs/12-cluster-time-sync.md`; deleting the repository would not have fixed it.

## Decommissioning

Removing the demo is destructive and should be a deliberate separate task:

1. Disable the GitLab webhook and Jenkins job.
2. Remove the child Application file from the GitOps repository and let Argo CD
   prune the `demo` resources.
3. Confirm no other workload uses the Harbor images or robots.
4. Revoke project tokens and Harbor robots.
5. Delete the source project and registry repository only when their loss is
   accepted.

Do not remove `platform-root`, the shared Harbor project, or Jenkins home as
part of demo cleanup.
