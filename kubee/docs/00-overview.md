# Platform Overview

## Goal

Build a repeatable, self-hosted DevOps platform on Kubernetes using the `d2-india.com` DNS zone.

The lab cluster should be treated as the proving ground. The main server should use the same repository layout, scripts, DNS names, namespaces, and install order, with only IP addresses, storage sizes, and hostnames changed in the environment file.

## Architecture

Developer pushes code to GitLab. Jenkins validates code, runs tests, performs SonarQube analysis, builds container images, and pushes them to Harbor. Jenkins then updates a separate GitOps repository with an immutable image tag. Argo CD watches that GitOps repository and deploys into Kubernetes.

Jenkins should not run `kubectl apply` for application deployment. Jenkins builds and updates Git. Argo CD deploys from Git.

## Component Map

| Layer | Component | Purpose |
| --- | --- | --- |
| Kubernetes networking | Calico | Pod networking and network policy |
| Metrics | metrics-server | Node and pod resource metrics |
| Ingress | ingress-nginx | HTTP/HTTPS routing |
| LoadBalancer IPs | MetalLB | Provides LAN IPs for services of type `LoadBalancer` |
| TLS | cert-manager | Issues internal certificates |
| Storage | local-path plus NFS CSI | Local volumes and shared file storage |
| Git hosting | GitLab CE | Repositories, merge requests, webhooks |
| CI | Jenkins | Test, scan, build, publish, GitOps update |
| Code quality | SonarQube Community Build | Static analysis and quality gates |
| Registry | Harbor | OCI image registry and vulnerability scanning |
| CD | Argo CD | GitOps reconciliation |
| Artifacts, later | Nexus Repository | Maven, npm, PyPI and generic package repositories |

## Install Phases

1. Cluster bootstrap: kubeadm control plane and worker join.
2. Foundation: metrics-server, ingress-nginx, MetalLB, cert-manager, default StorageClass.
3. Git and registry: GitLab CE and Harbor.
4. CI and quality: Jenkins and SonarQube.
5. GitOps CD: Argo CD and deployment repository.
6. Demo application: feature branch to production deployment.
7. Add-ons: Nexus, backups, monitoring, OpenBao, External Secrets.

The lab has completed phase 6 for `root/cicd-demo`. Its webhook-triggered build,
Harbor image, GitOps commit, Argo CD sync, two-replica deployment, and external
route have been verified. See `docs/13-demo-cicd-pipeline.md`. Gnomon onboarding
is prepared in `docs/14-gnomon-cicd-onboarding.md` and includes a mandatory
SonarQube quality gate before either application image is published.

## Current Lab Topology

| Role | Hostname | IP |
| --- | --- | --- |
| Control plane | `hb-ws-pc06.d2-india.com` | `10.191.0.40` |
| Worker | `hb-ws-pp05.d2-india.com` | `10.191.0.38` |
| Worker | `dd-test.d2-india.com` | `10.191.0.37` |

Expected node output:

```bash
kubectl get nodes -o wide
```

```text
hb-ws-pc06.d2-india.com   Ready   control-plane
hb-ws-pp05                Ready   worker
dd-test.d2-india.com      Ready   worker
```
