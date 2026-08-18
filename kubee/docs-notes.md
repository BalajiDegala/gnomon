• I’ll design this as an entirely self-hosted, open-source platform and separate what should run inside Kubernetes from node-level build services. I’m checking current component requirements and licensing first, because GitLab,
  SonarQube, Jenkins, Harbor/Artifactory, and Argo CD together are heavy for a two-node lab and some “free” editions do not include every feature people expect.

◦ Searching the web

• Searched the web for site:docs.gitlab.com install GitLab Helm chart requirements production PostgreSQL Redis object storage minimum resources ...

• Searching the web

• Searched the web for site:docs.sonarsource.com/sonarqube-community-build branch analysis pull request analysis community build ...

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• Yes—this is a solid self-hosted DevOps lab. The important part is assigning one clear responsibility to each component and introducing them in the right order.

  ## Recommended architecture

  Developer
     │
     ├── pushes feature branch
     ▼
  GitLab Community Edition
     │
     ├── Merge Request / review
     └── Webhook triggers Jenkins
                       │
                       ▼
                   Jenkins CI
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
     Unit tests    SonarQube    BuildKit build
                       │            │
                 Quality Gate       ▼
                                Harbor registry
                                    │
                       Image: app:<git-commit>
                                    │
                                    ▼
                        Jenkins updates GitOps repo
                                    │
                                    ▼
                               Argo CD
                                    │
                            watches GitOps repo
                                    │
                                    ▼
                         Kubernetes application

  The critical GitOps rule is: Jenkins should not run kubectl apply. Jenkins builds and tests the application, pushes an immutable image, and updates the image tag in a separate deployment repository. Argo CD detects that Git change and
  deploys it. Argo CD officially recommends separating application source and Kubernetes configuration repositories. Argo CD best practices (https://argo-cd.readthedocs.io/en/release-2.12/user-guide/best_practices/)

  ## Component choices

   Need                  Component                             Purpose
  ━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Git hosting           GitLab Community Edition              Repositories, users, feature branches, merge requests and webhooks
  ────────────────────  ────────────────────────────────────  ──────────────────────────────────────────────────────────────────────
   CI orchestration      Jenkins                               Tests, Sonar scanning, image builds and GitOps updates
  ────────────────────  ────────────────────────────────────  ──────────────────────────────────────────────────────────────────────
   Code quality          SonarQube Community Build             Static analysis and quality gates
  ────────────────────  ────────────────────────────────────  ──────────────────────────────────────────────────────────────────────
   Container registry    Harbor                                Stores images and scans them with Trivy
  ────────────────────  ────────────────────────────────────  ──────────────────────────────────────────────────────────────────────
   Package artifacts     Nexus Repository Community Edition    Maven, npm, PyPI, NuGet and other packages
  ────────────────────  ────────────────────────────────────  ──────────────────────────────────────────────────────────────────────
   Deployment            Argo CD                               Continuously reconciles Kubernetes from Git
  ────────────────────  ────────────────────────────────────  ──────────────────────────────────────────────────────────────────────
   Image builder         Rootless BuildKit                     Builds OCI/Docker images without exposing a privileged Docker daemon
  ────────────────────  ────────────────────────────────────  ──────────────────────────────────────────────────────────────────────
   Ingress               ingress-nginx                         Routes internal hostnames to services
  ────────────────────  ────────────────────────────────────  ──────────────────────────────────────────────────────────────────────
   TLS                   cert-manager plus internal CA         HTTPS certificates for the local network
  ────────────────────  ────────────────────────────────────  ──────────────────────────────────────────────────────────────────────
   Persistent storage    Longhorn, after worker joins          Replicated Kubernetes volumes
  ────────────────────  ────────────────────────────────────  ──────────────────────────────────────────────────────────────────────
   Secrets, initially    Kubernetes Secrets                    Bootstrap stage
  ────────────────────  ────────────────────────────────────  ──────────────────────────────────────────────────────────────────────
   Secrets, later        OpenBao + External Secrets            Better secret management
  ────────────────────  ────────────────────────────────────  ──────────────────────────────────────────────────────────────────────
   Monitoring, later     Prometheus and Grafana                Platform and application monitoring

  ## Harbor versus Artifactory

  You probably need two different repository functions:

  - Harbor for Docker/OCI images. It is fully open source, Kubernetes-oriented, supports projects, retention policies, replication and Trivy vulnerability scanning. Harbor needs at least roughly 2 CPU, 4 GB memory and 40 GB disk, with 4
    CPU/8 GB preferred. Harbor requirements (https://goharbor.io/docs/edge/install-config/installation-prereqs/), Trivy integration (https://goharbor.io/docs/main/administration/vulnerability-scanning/)

  - Nexus Repository Community Edition for compiled packages such as Maven artifacts, npm packages, Python wheels and generic files. Its community edition supports common repository formats. Nexus formats
    (https://help.sonatype.com/en/formats.html)

  JFrog Artifactory’s free offering has feature limitations and overlaps heavily with Harbor and Nexus. For the open-source-first design, I recommend Harbor + Nexus, not Artifactory. We can initially install only Harbor and add Nexus
  when an application genuinely produces package artifacts.

  ## Planned Git workflow

  1. Developer creates feature/my-change.
  2. Push triggers a Jenkins validation pipeline.
  3. Jenkins runs unit tests and a Sonar scan.
  4. Developer opens a merge request into main.
  5. GitLab requires review and a successful Jenkins status.
  6. After merge, Jenkins runs the release pipeline.
  7. Jenkins builds an image tagged with the Git commit SHA, for example:

  harbor.lab.local/apps/myapp:a1b2c3d

  8. Jenkins pushes the image to Harbor.
  9. Jenkins updates the separate platform-gitops repository:

  image:
    repository: harbor.lab.local/apps/myapp
    tag: a1b2c3d

  10. Argo CD detects that commit and deploys it.
  11. Argo CD reports whether the application is healthy and synchronized.

  Avoid using latest; commit-SHA tags give traceability and safe rollback.

  ## Important SonarQube limitation

  SonarQube Community Build supports quality analysis of the main branch, but official documentation distinguishes richer multi-branch and pull-request analysis as features of other editions. We can still run tests on every feature
  branch and enforce the Sonar quality gate on main, but full merge-request decoration may not be available in the fully free edition. SonarQube analysis overview
  (https://docs.sonarsource.com/sonarqube-community-build/analyzing-source-code/analysis-overview)

  ## Where components should run

  For this two-node learning cluster:

  Control-plane node
  ├── Kubernetes control-plane services
  ├── Argo CD
  ├── ingress-nginx
  └── cert-manager

  Worker node
  ├── GitLab
  ├── Jenkins controller
  ├── Ephemeral Jenkins build agents
  ├── SonarQube
  ├── Harbor
  ├── Nexus (later)
  ├── PostgreSQL
  └── Application workloads

  We should remove the control-plane scheduling taint only if the available worker cannot handle everything. Ideally, infrastructure workloads run on the worker and the control plane remains dedicated.

  However, GitLab alone lists 8 vCPU and 16 GB RAM as its normal single-node baseline, though constrained installations can run with 8 GB. Its Kubernetes chart also recommends a cluster totaling roughly 8 vCPU and 30 GB RAM. GitLab
  requirements (https://docs.gitlab.com/install/requirements/), GitLab chart quick start (https://docs.gitlab.com/charts/quickstart/)

  SonarQube adds approximately 2 CPU, 4 GB RAM and 30 GB disk for a small setup. SonarQube requirements (https://docs.sonarsource.com/sonarqube-community-build/server-installation/server-host-requirements)

  Consequently, a comfortable lab baseline for the entire platform is approximately:

  - 16 CPU cores across both nodes
  - 32 GB RAM total at an absolute practical minimum
  - 48–64 GB RAM preferred
  - 300–500 GB SSD storage
  - Static IP addresses
  - Working internal DNS
  - Backups stored outside the cluster

  ## Deployment phases

  1. Cluster foundation

     Join the worker, install Helm, ingress-nginx, MetalLB, cert-manager, a default StorageClass, DNS names and TLS.

  2. Git and registry

     Install GitLab CE and Harbor with persistent storage and backups.

  3. CI services

     Install Jenkins and SonarQube. Configure GitLab webhooks, Jenkins credentials and the Sonar quality gate.

  4. GitOps CD

     Install Argo CD and create separate source and deployment repositories.

  5. Demonstration application

     Create one small application with tests, a Dockerfile, Jenkinsfile, Helm/Kustomize manifests and a complete feature-branch-to-deployment workflow.

  6. Artifact and security additions

     Add Nexus, image-retention policies, Trivy gates, OpenBao/External Secrets, Prometheus and Grafana.

  Before installation, I need these infrastructure facts:

  - CPU, RAM and free disk on the control-plane machine
  - Expected CPU, RAM and disk on tomorrow’s worker
  - Whether you control an internal DNS domain, such as lab.example.com
  - Whether other machines can reach both nodes directly
  - Whether this is a learning lab or intended to host production workloads


