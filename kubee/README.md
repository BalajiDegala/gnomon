# d2-india Kubernetes DevOps Platform

This repository contains the bootstrap scripts, foundation manifests, and operating docs for a self-hosted Kubernetes DevOps platform under `d2-india.com`.

Current lab topology:

| Role | Hostname | IP |
| --- | --- | --- |
| Control plane | `hb-ws-pc06.d2-india.com` | `10.191.0.40` |
| Worker | `hb-ws-pp05.d2-india.com` | `10.191.0.38` |
| Worker | `dd-test.d2-india.com` | `10.191.0.37` |

Target platform services:

| Service | DNS name |
| --- | --- |
| GitLab | `gitlab.d2-india.com` |
| Harbor | `harbor.d2-india.com` |
| Jenkins | `jenkins.d2-india.com` |
| SonarQube | `sonar.d2-india.com` |
| Argo CD | `argocd.d2-india.com` |
| Nexus, later | `nexus.d2-india.com` |

Start here:

1. Read [docs/00-overview.md](docs/00-overview.md).
2. Fill [config/lab.env.example](config/lab.env.example) and save a real copy as `config/lab.env`.
3. Validate nodes with [scripts/check-cluster.sh](scripts/check-cluster.sh).
4. Install foundation add-ons with [scripts/install-foundation.sh](scripts/install-foundation.sh).
5. Build or troubleshoot shared storage with [docs/10-shared-storage.md](docs/10-shared-storage.md).
6. Install Argo CD and connect the deployment repository with [docs/11-argocd-install.md](docs/11-argocd-install.md).
7. Configure and troubleshoot node clock synchronization with [docs/12-cluster-time-sync.md](docs/12-cluster-time-sync.md).
8. Operate or rebuild the verified demo pipeline with [docs/13-demo-cicd-pipeline.md](docs/13-demo-cicd-pipeline.md).
9. Onboard Gnomon, including SonarQube, with [docs/14-gnomon-cicd-onboarding.md](docs/14-gnomon-cicd-onboarding.md).

The same structure can be reused on the main server by creating a separate env file, for example `config/main.env`, and running scripts with that file.
