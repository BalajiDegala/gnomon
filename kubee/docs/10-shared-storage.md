# Shared Kubernetes Storage

## Current Design

The cluster has two storage tiers:

| StorageClass | Backend | Use | Current default |
| --- | --- | --- | --- |
| `local-path` | Node-local directories | Existing PVCs and workloads requiring local disk | Yes |
| `nfs-shared` | NFSv4.1 on `10.191.0.37:/pipedev/k8s-nfs` | Shared or movable file-based PVCs | No |

The NFS server is `dd-test.d2-india.com` (`10.191.0.37`). Its `/pipedev`
filesystem is a separate 466 GB XFS disk. At installation it had about 448 GB
free. The export is restricted to `10.191.0.0/24`.

`nfs-shared` uses the Kubernetes SIG Storage NFS CSI driver, Helm chart
`4.13.4`. The driver dynamically creates a separate NFS subdirectory for every
PVC. Applications share the storage backend, not a single PVC.

Important limitations:

- The NFS host and its disk are a single point of failure. This is suitable for
  the lab, but it is not highly available storage and it is not a backup.
- NFS claim sizes are accounting values, not filesystem quotas. Monitor the
  real free space on `/pipedev`.
- GitLab Gitaly repository storage must stay on fast local/block storage. GitLab
  does not support NFS for Gitaly repository data.
- Databases and latency-sensitive search indexes should normally use local or
  replicated block storage. Move them to NFS only after application-specific
  compatibility and performance testing.

## Repository Files

| File | Purpose |
| --- | --- |
| `config/lab.env` | Live lab NFS addresses, export, class, version, and test nodes |
| `scripts/setup-nfs-server.sh` | Idempotently installs and configures the NFS server |
| `scripts/setup-nfs-client.sh` | Installs client tools and performs a bounded mount/write test |
| `scripts/install-nfs-storage.sh` | Installs the pinned CSI chart and applies the StorageClass |
| `scripts/check-nfs-storage.sh` | Read-only health and inventory report |
| `scripts/test-nfs-storage.sh` | Disposable cross-node provisioning and expansion smoke test |
| `manifests/foundation/nfs-storageclass.yaml.tpl` | Source template for `nfs-shared` |

## Safety Properties

The setup intentionally includes these protections:

- `/pipedev` is a persistent `/etc/fstab` mount.
- The NFS systemd unit has `RequiresMountsFor=/pipedev/k8s-nfs`. NFS will not
  start against an empty directory on the root filesystem if the data disk is
  missing during boot.
- The export uses synchronous writes.
- Clients are limited to `10.191.0.0/24`.
- The StorageClass is not default, so existing and future charts do not switch
  storage silently.
- `reclaimPolicy: Retain` protects data when a PVC is deleted. An administrator
  must explicitly decide what to do with the released PV.
- The CSI chart version is pinned rather than tracking an unreviewed latest
  release.

The export uses `no_root_squash` because the CSI driver and Kubernetes
`fsGroup` handling need to create and adjust per-PVC directories as root. Treat
every Kubernetes node in the allowed subnet as trusted. For a production
network, isolate storage traffic and evaluate Kerberos-secured NFS.

## Recreate on a New Cluster

### 1. Prepare the Storage Disk

Attach and format a dedicated disk. Use its UUID in `/etc/fstab`; do not depend
on a potentially changing device name such as `/dev/sdb1`.

Example inspection commands:

```bash
lsblk -f
blkid
findmnt --fstab --target /pipedev
findmnt -T /pipedev
df -h /pipedev
```

Confirm the disk is mounted before creating the export. Never allow
`/pipedev/k8s-nfs` to fall back to the root filesystem.

### 2. Configure the Environment

Set these values in the environment file:

```bash
NFS_SERVER_IP=10.191.0.37
NFS_EXPORT_PATH=/pipedev/k8s-nfs
NFS_EXPORT_CIDR=10.191.0.0/24
NFS_STORAGE_CLASS=nfs-shared
NFS_CSI_VERSION=4.13.4
NFS_TEST_WRITER_NODE=dd-test.d2-india.com
NFS_TEST_READER_NODE=hb-ws-pp05
```

Use a stable server IP. Changing `NFS_SERVER_IP` later does not rewrite
existing PVs, because every PV records the server address used when it was
created.

### 3. Configure the NFS Server

On the host that owns the data disk:

```bash
sudo scripts/setup-nfs-server.sh config/lab.env
```

The script installs `nfs-utils`, creates the export and systemd mount
dependency, starts NFS, applies firewalld services when firewalld is active,
and verifies NFSv4 RPC registration.

### 4. Prepare Every Kubernetes Node

Run this on the control plane and every worker before installing CSI:

```bash
sudo scripts/setup-nfs-client.sh config/lab.env
```

This installs `nfs-utils` if required and performs a temporary NFSv4.1
mount/write/unmount test. Run it again whenever a new node joins the cluster.
The CSI node DaemonSet will automatically appear on a new node, but host mount
helpers must exist first.

### 5. Install CSI and the StorageClass

From a machine with cluster-admin kubeconfig:

```bash
scripts/install-nfs-storage.sh config/lab.env
```

The command is idempotent and uses `helm upgrade --install`.

### 6. Validate Across Nodes

```bash
scripts/check-nfs-storage.sh config/lab.env
scripts/test-nfs-storage.sh config/lab.env
```

The smoke test dynamically provisions an RWX claim, writes on the configured
writer node, reads the same file from the other worker, expands the claim from
1 GiB to 2 GiB, and removes all disposable Kubernetes and NFS data.

## Create a Shared PVC

Each application receives its own claim:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: application-data
  namespace: application
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: nfs-shared
  resources:
    requests:
      storage: 20Gi
```

Use `ReadWriteOnce` when only one node should mount the volume. NFS supports
both modes, but the application must still be safe for concurrent access before
using `ReadWriteMany`.

Do not mount one PVC into unrelated applications. Separate claims preserve
ownership boundaries and allow independent backup, migration, and deletion.

## Expand a Claim

The class allows expansion:

```bash
kubectl patch pvc application-data -n application --type merge \
  -p '{"spec":{"resources":{"requests":{"storage":"40Gi"}}}}'

kubectl get pvc application-data -n application
```

NFS CSI updates Kubernetes capacity metadata. It does not create a per-PVC
quota on the shared XFS filesystem, so `df -h /pipedev` remains the authoritative
capacity check.

## Default StorageClass

`local-path` remains default during migration. To deliberately make NFS the
default later, first verify that no workload implicitly requires local storage,
then ensure only one class has the default annotation:

```bash
kubectl annotate storageclass local-path \
  storageclass.kubernetes.io/is-default-class-
kubectl annotate storageclass nfs-shared \
  storageclass.kubernetes.io/is-default-class=true --overwrite
kubectl get storageclass
```

Changing the default affects only new PVCs that omit `storageClassName`.
Existing PVCs never migrate automatically.

Do not set one global GitLab storage value to NFS if it also moves Gitaly.
Configure GitLab components individually and keep repository storage local.

## Existing PVC Migration

A PVC's StorageClass is immutable. Never edit a local-path PV to point at NFS.
Migrate one application at a time:

1. Record the Helm values, StatefulSets, PVCs, PVs, node affinity, and actual
   directory usage.
2. Create and verify an application-native backup. Use database dumps for
   PostgreSQL; copying a live database directory is not a consistent backup.
3. Create a new claim using `nfs-shared`.
4. Stop or scale down every writer for that application.
5. Copy files while the old volume is quiescent. A helper Pod mounting the old
   and new claims must run on the node selected by the old local-path PV.
6. Update Helm values or manifests to use the new claim. StatefulSet
   `volumeClaimTemplates` are immutable, so chart-specific recreation or
   backup/restore may be required.
7. Start the application and verify data, logs, probes, and a functional
   read/write operation.
8. Keep the old PVC and backup through an agreed rollback period.
9. Delete old storage only after explicit review.

Recommended first migration candidates are file-oriented data such as Jenkins
home, Harbor registry content, object storage, shared artifacts, and backup
destinations. Treat Gitaly, PostgreSQL, Redis, and SonarQube search data as
separate application-specific decisions.

### Lab migration plan recorded 2026-08-17

The existing stateful workloads are concentrated on `hb-ws-pp05` and use its
root XFS filesystem through `local-path`. At inspection time that filesystem
was 453 GiB total, 319 GiB used, and 134 GiB free (71% used). The dedicated
`/pipedev` XFS filesystem on `dd-test` was 466 GiB total with about 448 GiB
free.

Do not replace every PVC with NFS. Use this placement:

| Data | Target | Reason |
| --- | --- | --- |
| Jenkins home | `nfs-shared` | File-oriented and benefits from cross-node mounting |
| Harbor registry and job logs | `nfs-shared` after a Harbor-specific test | File/blob content; keep Harbor database separate |
| GitLab artifacts, uploads, LFS, and packages | Keep behind object storage | Do not mount the same NFS directory directly into multiple GitLab components |
| Bundled GitLab MinIO data | Dedicated local volume on `/pipedev`, or a supported external S3 service | Avoid putting MinIO's storage engine on NFS |
| GitLab Gitaly repositories | Local or replicated block storage | GitLab does not support Gitaly repository storage on NFS |
| PostgreSQL databases | Local or replicated block storage | Use database-native backup/restore; never copy a live data directory |
| SonarQube application/search data | Local or supported block storage | Embedded search data is not a general shared-filesystem workload |
| Redis and rebuildable caches | Local; recreate when appropriate | Shared persistence provides little benefit for disposable caches |

Because this lab's application data was declared disposable, a chart-specific
PVC recreation may replace backup/copy/restore. Still change only one
application at a time, validate it, and leave GitLab Gitaly and all databases
off NFS.

## Routine Health Checks

Cluster view:

```bash
scripts/check-nfs-storage.sh config/lab.env
kubectl get pvc -A
kubectl get pv
kubectl get events -A --sort-by=.lastTimestamp | tail -n 100
```

NFS server view:

```bash
findmnt --target /pipedev
df -h /pipedev
sudo du -x -h -d1 /pipedev/k8s-nfs | sort -h
sudo systemctl status nfs-server
sudo exportfs -v
rpcinfo -t 10.191.0.37 nfs 4
```

Recommended capacity policy:

- Warn at 70% used.
- Plan cleanup or expansion at 80%.
- Treat 90% as urgent; stop nonessential writers before the filesystem fills.

## Troubleshooting

### PVC Stays Pending

```bash
kubectl describe pvc -n NAMESPACE PVC_NAME
kubectl get storageclass nfs-shared -o yaml
kubectl logs -n kube-system deployment/csi-nfs-controller \
  -c csi-provisioner --tail=200
kubectl logs -n kube-system deployment/csi-nfs-controller \
  -c nfs --tail=200
```

Check that the class uses `nfs.csi.k8s.io`, the server is `10.191.0.37`, and the
share is `/pipedev/k8s-nfs`.

### Pod Stays ContainerCreating With a Mount Error

```bash
kubectl describe pod -n NAMESPACE POD_NAME
kubectl get pods -n kube-system -l app.kubernetes.io/instance=csi-driver-nfs -o wide
kubectl logs -n kube-system daemonset/csi-nfs-node -c nfs --tail=200
```

On the affected node:

```bash
rpm -q nfs-utils
rpcinfo -t 10.191.0.37 nfs 4
sudo scripts/setup-nfs-client.sh config/lab.env
```

`mount.nfs: command not found` means `nfs-utils` is missing on that node.
`Connection timed out` normally indicates NFS server, routing, or firewall
failure. `access denied by server` normally indicates the client subnet is not
allowed by `/etc/exports.d/kubee-nfs.exports`.

### Permission Denied Inside a Pod

Inspect the pod security context, requested `fsGroup`, and directory ownership:

```bash
kubectl get pod -n NAMESPACE POD_NAME -o yaml
kubectl get pv PV_NAME -o yaml
```

The class initially creates directories with mode `0770`. Prefer setting the
correct pod `runAsUser`, `runAsGroup`, and `fsGroup` instead of changing the
entire export to `0777`.

### NFS Server Reboot or Disk-Mount Failure

On `dd-test`, verify the data disk before restarting NFS:

```bash
findmnt --target /pipedev
df -h /pipedev
sudo systemctl status nfs-server
sudo systemctl restart nfs-server
sudo exportfs -rav
```

If `/pipedev` is not mounted, do not create directories and do not bypass the
systemd dependency. Repair the mount first. Pods with `hard` NFS mounts may
pause I/O while the server is unavailable and resume when it returns.

### Released PV After Accidental PVC Deletion

Because the class uses `Retain`, the PV and NFS directory remain. Do not delete
the PV. Record its `.spec.csi.volumeHandle`, server, share, and subdirectory,
then create a recovery PV/PVC or restore the application with that retained
data. Back up the NFS directory before changing reclaim policy.

### CSI Upgrade or Rollback

```bash
helm repo update csi-driver-nfs
helm search repo csi-driver-nfs/csi-driver-nfs --versions
helm history csi-driver-nfs -n kube-system
```

Review upstream release notes, update `NFS_CSI_VERSION`, then rerun
`scripts/install-nfs-storage.sh`. If an upgrade fails:

```bash
helm rollback csi-driver-nfs REVISION -n kube-system --wait --timeout 10m
```

Do not uninstall CSI while any PV uses `nfs.csi.k8s.io`.

## Backup and Disaster Recovery

NFS centralizes data but does not protect it from disk failure, host loss,
ransomware, or administrative deletion. Back up to a different machine or
storage system.

For file data, stop writers or use the application's supported backup process,
then preserve numeric ownership and extended attributes:

```bash
sudo rsync -aHAX --numeric-ids /pipedev/k8s-nfs/ /BACKUP_TARGET/k8s-nfs/
```

Use application-native backups for GitLab, Harbor, Jenkins, SonarQube, and all
databases. Regularly test restoring into a temporary namespace; an untested
backup is not a recovery plan.

## Upstream References

- NFS CSI driver: <https://github.com/kubernetes-csi/csi-driver-nfs>
- NFS CSI chart: <https://github.com/kubernetes-csi/csi-driver-nfs/tree/master/charts>
- Driver parameters: <https://github.com/kubernetes-csi/csi-driver-nfs/blob/master/docs/driver-parameters.md>
- Kubernetes persistent volumes: <https://kubernetes.io/docs/concepts/storage/persistent-volumes/>
- RHEL 9 NFS server guide: <https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/configuring_and_using_network_file_services/deploying-an-nfs-server_configuring-and-using-network-file-services>
- GitLab Gitaly storage: <https://docs.gitlab.com/administration/gitaly/>
