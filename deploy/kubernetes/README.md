# Gnomon on plain Kubernetes (no Helm)

Manifests for the `gnomon` namespace on the single-node `dd-test.d2-india.com`
cluster, served at **http://gnomon.d2-india.com** through ingress-nginx
(LoadBalancer `10.191.0.240`). Apply with `kubectl apply -k` (kustomize is built
into kubectl).

| File                  | What                                                                    |
| --------------------- | ----------------------------------------------------------------------- |
| `namespace.yaml`      | `gnomon` namespace                                                      |
| `storage.yaml`        | `gnomon-local` StorageClass (no provisioner) + local PVs for DB/backups |
| `mongodb.yaml`        | MongoDB 4.4 StatefulSet + headless Service                              |
| `api.yaml`            | API Deployment (2 replicas) + Service :4000                             |
| `web.yaml`            | Web (nginx) Deployment (2 replicas) + Service :8080                     |
| `mongodb-backup.yaml` | Backup PVC + nightly `mongodump` CronJob (01:30 IST, 14-day retention)  |
| `ingress.yaml`        | `gnomon.d2-india.com`: `/api` → API, `/` → web                          |
| `config/`             | API env + nginx config (generated ConfigMaps; edits roll the pods)      |
| `secret.example.yaml` | Secret template — **not** applied by kustomize                          |
| `admin-seed-job.yaml` | One-off first-admin Job — **not** applied by kustomize                  |

## Deploying and releasing

Step-by-step install, upgrade, rollback and troubleshooting (images from private
Docker Hub repositories) are in
[docs/DOCKERHUB_DEPLOYMENT_RUNBOOK.md](../../docs/DOCKERHUB_DEPLOYMENT_RUNBOOK.md).

In short:

```sh
DOCKERHUB_USER=balajid scripts/push-dockerhub-images.sh      # prints <tag>
sed -i -E 's#(newName: docker.io/)[^/]+/#\1<user>/#; s#(newTag: ).*#\1"<tag>"#' \
  deploy/kubernetes/kustomization.yaml
kubectl apply -k deploy/kubernetes
```

Every push gets a new tag; re-using a tag does not update running pods.

## Backups

- Archives: `/pipedev/k8s-local/gnomon-backups/gnomon-YYYYmmdd-HHMMSS.archive.gz` on the node.
- Run one now: `kubectl -n gnomon create job --from=cronjob/gnomon-mongodb-backup backup-$(date +%s)`
- Restore (replaces existing collections):

  ```sh
  kubectl -n gnomon exec -i gnomon-mongodb-0 -- sh -c \
    'mongorestore --uri="mongodb://gnomonadmin:$MONGO_INITDB_ROOT_PASSWORD@localhost:27017/?authSource=admin" \
       --gzip --archive --drop --nsInclude="gnomon.*"' \
    < /pipedev/k8s-local/gnomon-backups/gnomon-<stamp>.archive.gz
  ```

Backups sit on the same disk as the database; copy them off the node for real disaster recovery.

## HTTPS

Create a TLS secret `gnomon-tls` (or a cert-manager `Certificate`), uncomment `tls:` in
`ingress.yaml`, set `COOKIE_SECURE=true` and `WEB_ORIGIN=https://gnomon.d2-india.com` in
`config/api.env`, then `kubectl apply -k`.

## Relation to the Helm chart

`deploy/helm/gnomon` (driven by Argo CD) and these manifests are alternatives — **run only
one** in the `gnomon` namespace: both claim the same host name and the same MongoDB host
directory. The names here (`gnomon-api`, `gnomon-k8s-mongodb` PV, `gnomon-secrets`) differ
from the chart's (`gnomon-gnomon-api`, `gnomon-mongodb` PV, `gnomon-runtime`), so switching
means deleting the other deployment first; the `Retain` reclaim policy keeps the data.
