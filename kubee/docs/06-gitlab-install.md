# GitLab CE Lab Install

This GitLab install is for the lab cluster. It uses the official GitLab Helm chart and explicit in-cluster dependencies managed by this repository.

For production, GitLab requires PostgreSQL, Redis, and object storage to be configured outside the GitLab Helm chart. In this lab, those dependencies run inside Kubernetes as separate services:

- PostgreSQL StatefulSet
- Redis StatefulSet
- self-hosted MinIO StatefulSet

MinIO is local to this Kubernetes cluster. No AWS or external cloud service is used.

PostgreSQL is configured with `max_locks_per_transaction=256` because GitLab's
initial schema load exceeds PostgreSQL's default lock allocation.

## Hostname

```text
gitlab.d2-india.com
```

For `/etc/hosts` based access:

```text
10.191.0.240 gitlab.d2-india.com
```

## Render Values

```bash
scripts/render-gitlab-values.sh config/lab.env
```

Generated file:

```text
manifests/gitlab/gitlab-values.yaml
```

## Install

Install local GitLab dependencies first:

```bash
scripts/install-gitlab-dependencies.sh config/lab.env
```

Then install GitLab:

```bash
HELM_RETRIES=5 scripts/install-gitlab.sh config/lab.env
```

## Recreate an Incompatible Fresh PostgreSQL Database

GitLab 19 requires PostgreSQL 17 or newer. The dependency manifest uses
`postgres:17-alpine`, and the dependency installer verifies the live server
version. If an earlier lab attempt created the PostgreSQL volume with version
16, and the database contains no data to preserve, recreate only that database:

```bash
kubectl -n gitlab delete statefulset gitlab-postgresql
kubectl -n gitlab delete pvc data-gitlab-postgresql-0
scripts/install-gitlab-dependencies.sh config/lab.env
HELM_RETRIES=5 scripts/install-gitlab.sh config/lab.env
```

Deleting the PVC permanently removes the existing GitLab database. Use a proper
PostgreSQL major-version upgrade instead when data must be retained.

## Watch

```bash
kubectl get pods -n gitlab -w
kubectl get ingress -n gitlab
kubectl get pvc -n gitlab
```

## Initial Root Password

```bash
kubectl get secret -n gitlab gitlab-gitlab-initial-root-password -o jsonpath='{.data.password}' | base64 -d; echo
```

Login:

```text
URL: http://gitlab.d2-india.com
Username: root
Password: value from the secret above
```

## Notes

This values file disables:

- GitLab chart managed nginx ingress
- GitLab chart Gateway API and bundled Envoy Gateway
- GitLab chart managed cert-manager
- GitLab container registry
- GitLab runner
- Prometheus

The platform will use:

- ingress-nginx already installed in the cluster
- cert-manager already installed in the cluster
- local MinIO inside Kubernetes for GitLab object storage
- Harbor later as the image registry
- Jenkins later as the CI runner

The generated object-storage secret contains `provider: AWS` because GitLab's
storage library uses that value for S3-compatible storage APIs. The dependency
installer reads the `gitlab-minio` Service ClusterIP and uses that internal IP
as the endpoint, so traffic stays inside the cluster and avoids the Ruby
resolver failure described below. If the Service is ever deleted and recreated,
rerun `scripts/install-gitlab-dependencies.sh` and restart GitLab workloads so
the generated endpoint follows the new ClusterIP.

## Troubleshooting an HTTP 500

Copy the Request ID from GitLab's error page and search the webservice logs for
that exact value. For example:

```bash
REQUEST_ID=01M07EGCCDD9K1T2Q4F189YMZ0
kubectl logs deployment/gitlab-webservice-default -n gitlab \
  --all-containers --since=30m --prefix | rg -C 12 "$REQUEST_ID"
```

The request above failed in `RootController#index` because the GitLab
webservice's Ruby resolver could not resolve
`gitlab-minio.gitlab.svc.cluster.local`. The operating-system resolver can still
succeed while Ruby `Resolv` fails. Check both paths and object storage from the
affected webservice pod:

```bash
kubectl get pods,service,endpointslice -n kube-system -l k8s-app=kube-dns
kubectl logs deployment/coredns -n kube-system --since=30m
kubectl exec -n gitlab deployment/gitlab-webservice-default -c webservice -- \
  getent hosts gitlab-minio.gitlab.svc.cluster.local
kubectl exec -n gitlab deployment/gitlab-webservice-default -c webservice -- \
  ruby -rresolv -e \
  'puts Resolv.getaddress("gitlab-minio.gitlab.svc.cluster.local")'
kubectl exec -n gitlab deployment/gitlab-webservice-default -c webservice -- \
  curl --fail --silent --show-error --max-time 10 \
  http://gitlab-minio.gitlab.svc.cluster.local:9000/minio/health/live
```

An empty response from the last command with exit code zero is healthy. Also
check PostgreSQL, Redis, and Gitaly before restarting anything:

```bash
kubectl get pods -n gitlab -o wide
kubectl get service,endpointslice -n gitlab
kubectl logs statefulset/gitlab-gitaly -n gitlab --since=30m --tail=200
kubectl logs deployment/gitlab-sidekiq-all-in-1-v2 -n gitlab \
  --all-containers --since=30m --tail=200
```

If `getent` works but Ruby fails with `Resolv::ResolvError`, regenerate the
object-storage Secrets with the Service ClusterIP and roll the GitLab consumers:

```bash
scripts/install-gitlab-dependencies.sh config/lab.env
kubectl rollout restart deployment/gitlab-webservice-default -n gitlab
kubectl rollout restart deployment/gitlab-sidekiq-all-in-1-v2 -n gitlab
kubectl rollout restart deployment/gitlab-toolbox -n gitlab
kubectl rollout status deployment/gitlab-webservice-default -n gitlab \
  --timeout=10m
kubectl rollout status deployment/gitlab-sidekiq-all-in-1-v2 -n gitlab \
  --timeout=10m
kubectl rollout status deployment/gitlab-toolbox -n gitlab --timeout=10m
```

Then refresh the failed page and search for a new Request ID only if the error
repeats. Preserve the Request ID, timestamp, path, exception class, and exception
message in incident notes. Do not delete or recreate a GitLab PVC for an HTTP
500 without first proving a storage-volume failure and taking a verified backup.
### Rotate the bundled MinIO credentials

Use the rotation helper if the bundled MinIO secret is disclosed. It changes
only the MinIO access credential; it does not remove buckets, PVCs, Git
repositories, or database rows:

```bash
scripts/rotate-gitlab-minio-credentials.sh config/lab.env
```

The script restarts MinIO, regenerates the Rails and backup connection secrets,
checks the buckets, and rolls the GitLab webservice, Sidekiq, and Toolbox. Never
print or decode `gitlab-minio`, `gitlab-object-storage`, or
`gitlab-backup-storage` during routine validation.
If a project or admin-project page fails with:

```text
permission denied: token's validity window is in future
```

the repository is not necessarily damaged. Compare the webservice or Toolbox
node clock with the Gitaly node clock and repair Chrony. See
[Cluster Time Synchronization](12-cluster-time-sync.md). Deleting the project,
its PVC, or the GitLab release does not fix clock skew.
