# Argo CD and GitOps Repository

Argo CD is the continuous-delivery controller for the platform. Jenkins builds
images and changes Git; Argo CD is the only component that reconciles those
application manifests into Kubernetes.

## Lab Design

- Official `argo-cd` Helm chart pinned by `ARGOCD_CHART_VERSION`
- NGINX ingress at `https://argocd.d2-india.com`
- TLS termination at NGINX, with the backend deliberately using HTTP
- Certificate created by cert-manager from `d2-india-selfsigned`
- Local `admin` login initially; Dex remains disabled until GitLab OIDC is ready
- Private GitLab repository at `GITOPS_REPO_URL`
- Read-only deploy token stored only in the `argocd` namespace
- App-of-apps root named `platform-root`

The current LAN service records are not available from the DNS resolver used by
CoreDNS. The Helm values therefore add `GITLAB_HOST` to Argo CD pods with
`INGRESS_LB_IP`. Remove that host alias after the records are published in DNS
and verified from a test pod.

Argo CD does not need a PersistentVolume in this layout. Its desired application
state belongs in Git. Runtime configuration, account data, and repository access
are Kubernetes ConfigMaps and Secrets and must be included in cluster backups.

## Install or Rebuild Argo CD

Check `ARGOCD_HOST`, `ARGOCD_CHART_VERSION`, and `ARGOCD_CERT_ISSUER` in the
environment file, then run:

```bash
scripts/render-argocd-values.sh config/lab.env
helm template argocd argo/argo-cd \
  --namespace argocd \
  --version 10.2.1 \
  --values manifests/argocd/argocd-values.yaml >/tmp/argocd-rendered.yaml
scripts/install-argocd.sh config/lab.env
scripts/check-argocd.sh config/lab.env
```

The installer uses `helm upgrade --install --atomic`, so the same command is
used for a clean installation and a controlled repeat run.

## First Login

Open `https://argocd.d2-india.com` and accept the browser warning for the lab's
self-signed certificate. The username is `admin`. Read the generated one-time
password without copying it into this repository:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 --decode
echo
```

Change the password in **User info > Update password**, verify a second login,
then remove the initial credential:

```bash
kubectl delete secret argocd-initial-admin-secret -n argocd
```

Store the new password in the team's password manager, not `secrets.md`, an env
file, shell history, or Git.

## Create and Seed the GitLab Repository

For a new lab, the automation creates the private project, adds only missing
seed files, creates a one-year `read_repository` deploy token, puts that token
directly into the Argo CD repository Secret, and revokes its temporary GitLab
administrator session:

```bash
env -u KUBECONFIG scripts/create-gitops-repository.py config/lab.env
scripts/bootstrap-argocd.sh config/lab.env
```

The automation creates a one-day administrator API token inside the GitLab
toolbox pod, reaches GitLab through a localhost-only Kubernetes port-forward,
then revokes that token in its cleanup step. It does not need the root password,
does not print either token, and does not overwrite an existing repository
file. Use the manual procedure below if GitLab Rails administration is not
available to the operator.

For the manual path, create the private repository shown by
`GITOPS_REPO_URL`. Its lab-default path is `root/platform-gitops`. Push the
included seed directory:

```bash
cd gitops
git init --initial-branch=main
git add .
git commit -m "Bootstrap lab GitOps repository"
git remote add origin http://gitlab.d2-india.com/root/platform-gitops.git
git push --set-upstream origin main
```

In GitLab, create a deploy token with only `read_repository`. Save its generated
username and token in the password manager. Configure Argo CD interactively:

```bash
scripts/configure-argocd-repository.sh config/lab.env
scripts/bootstrap-argocd.sh config/lab.env
kubectl get appproject,application -n argocd
```

The helper never writes the token to disk. The resulting Secret is named
`platform-gitops-repository`; Argo CD discovers it by label. Do not use a GitLab
administrator password as a long-lived repository credential.

## Expected Healthy State

```bash
helm list -n argocd
kubectl get pods,ingress,certificate -n argocd
kubectl get appproject,application -n argocd
curl --insecure https://argocd.d2-india.com/healthz
```

The Helm release should be `deployed`, all workload pods should be Ready, the
certificate should be `Ready=True`, and `/healthz` should return `ok`. After the
seed repository is connected, `platform-root` should be `Synced` and `Healthy`.

## Credentials and Backups

The Git repository is the backup for desired application state. The following
cluster objects also need encrypted backup because they cannot be recreated from
public manifests alone:

```bash
kubectl get secret argocd-secret -n argocd -o yaml
kubectl get secret platform-gitops-repository -n argocd -o yaml
kubectl get configmap argocd-cm argocd-rbac-cm -n argocd -o yaml
```

Do not save these plaintext YAML documents inside this repository. Put them in
the protected cluster-backup location, encrypt the backup, and test restoration.
When External Secrets is installed later, move repository credentials there.

For disaster recovery:

1. Restore Kubernetes and cert-manager.
2. Run `scripts/install-argocd.sh` using the pinned version.
3. Restore `argocd-secret`, or establish a new admin password.
4. Restore or recreate the read-only GitLab deploy token Secret.
5. Run `scripts/bootstrap-argocd.sh`.
6. Confirm every Application is Synced and Healthy before enabling CI writes.

## Upgrade Procedure

1. Read the Argo CD and Helm-chart upgrade notes, including CRD changes.
2. Back up Argo CD Secrets, ConfigMaps, AppProjects, and Applications.
3. Change `ARGOCD_CHART_VERSION` in the environment file.
4. Render values and inspect `helm diff` if that plugin is available; otherwise
   inspect `helm template` output.
5. Run the installer, then the health check.
6. Confirm repository connectivity and perform a non-production sync before
   allowing automatic production reconciliation.

Never use an unpinned `latest` chart in a rebuild.

## Troubleshooting

### Browser, DNS, or ingress failure

```bash
getent hosts argocd.d2-india.com
kubectl get ingress argocd-server -n argocd -o wide
kubectl describe ingress argocd-server -n argocd
curl -vk --resolve argocd.d2-india.com:443:10.191.0.240 \
  https://argocd.d2-india.com/healthz
```

The DNS record must resolve to `INGRESS_LB_IP`. The ingress backend annotation
must be `HTTP`, because `server.insecure=true` means NGINX terminates TLS.

### Certificate not Ready

```bash
kubectl describe certificate argocd-server -n argocd
kubectl get certificaterequest -n argocd
kubectl logs -n cert-manager deployment/cert-manager --since=15m
kubectl get secret argocd-server-tls -n argocd
```

Verify that `ARGOCD_CERT_ISSUER` names a Ready ClusterIssuer. A self-signed lab
certificate is encrypted in transit but is not browser-trusted.

### A pod is not Ready

```bash
kubectl get pods -n argocd -o wide
kubectl describe pod -n argocd POD_NAME
kubectl logs -n argocd POD_NAME --all-containers --tail=200
kubectl get events -n argocd --sort-by=.lastTimestamp
```

Check scheduling/resources first, then image pulls, NetworkPolicies, and the
specific container logs. Redis is a disposable cache here; there is no Redis PVC
to restore.

### Repository or comparison failure

```bash
kubectl get secret platform-gitops-repository -n argocd
kubectl logs -n argocd deployment/argocd-repo-server --tail=200
kubectl describe application platform-root -n argocd
```

Confirm the repository URL exactly matches the AppProject source allow-list and
that the deploy token still has `read_repository`. Rotate a token by rerunning
`scripts/configure-argocd-repository.sh`; never patch its value into Git.

For `lookup gitlab.d2-india.com ... no such host`, confirm the rendered Argo CD
values contain the GitLab host alias and that the repo-server pod has it:

```bash
kubectl exec -n argocd deployment/argocd-repo-server -- \
  getent hosts gitlab.d2-india.com
```

The long-term fix is to publish all `d2-india.com` platform records in the DNS
server used by Kubernetes nodes and CoreDNS. Once a pod resolves the record to
`INGRESS_LB_IP`, remove the temporary Helm host alias and upgrade Argo CD.

### UI works but the CLI does not

The single NGINX ingress is configured for the web/API HTTP backend. Use the
Argo CD CLI with `--grpc-web`, or port-forward the service:

```bash
kubectl port-forward service/argocd-server -n argocd 8080:80
```

Then connect the CLI to `localhost:8080` with its insecure/local flags. Do not
enable SSL passthrough on the shared ingress controller without reviewing its
effect on every hosted service.

## Reference Documentation

- [Argo CD Helm chart](https://github.com/argoproj/argo-helm/tree/main/charts/argo-cd)
- [Argo CD ingress configuration](https://argo-cd.readthedocs.io/en/stable/operator-manual/ingress/)
- [Declarative repository and Application setup](https://argo-cd.readthedocs.io/en/stable/operator-manual/declarative-setup/)
- [Initial administrator password](https://argo-cd.readthedocs.io/en/stable/faq/)
