# Foundation Add-ons

Install foundation add-ons before GitLab, Harbor, Jenkins, SonarQube, or Argo CD.

Recommended order:

1. metrics-server
2. ingress-nginx
3. MetalLB
4. cert-manager
5. default StorageClass
6. shared NFS StorageClass, when shared capacity is available

## Environment File

Copy the example:

```bash
cp config/lab.env.example config/lab.env
```

Edit at least:

```bash
METALLB_ADDRESS_POOL=10.191.0.240-10.191.0.250
INGRESS_DOMAIN=d2-india.com
```

## Install

Run from a machine with working admin kubeconfig:

```bash
scripts/check-cluster.sh
scripts/install-foundation.sh config/lab.env
```

## Verify

```bash
kubectl get nodes
kubectl get pods -A
kubectl get storageclass
kubectl get svc -n ingress-nginx
kubectl get ipaddresspool -n metallb-system
kubectl get clusterissuer
```

The ingress controller should receive an external IP from the MetalLB pool. Use that IP for `*.d2-india.com` DNS records.

## Shared Storage

The lab also provides the non-default `nfs-shared` StorageClass from the
dedicated `/pipedev` disk on `dd-test`. Its server, client, installation,
validation, recovery, and troubleshooting procedure is documented in
[10-shared-storage.md](10-shared-storage.md).

Do not change the default StorageClass or migrate existing PVCs as part of the
foundation install. Storage migration requires application-specific backups
and a maintenance window.
