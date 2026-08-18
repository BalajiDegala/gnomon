# Service Installation Plan

Do not install all services at once. Install and validate each layer.

## Namespaces

| Namespace | Purpose |
| --- | --- |
| `gitlab` | GitLab CE |
| `harbor` | Harbor registry |
| `jenkins` | Jenkins controller and agents |
| `sonarqube` | SonarQube |
| `argocd` | Argo CD |
| `nexus` | Nexus, later |
| `platform-system` | Shared platform utilities |

## DNS Names

| Service | Hostname |
| --- | --- |
| GitLab | `gitlab.d2-india.com` |
| Harbor | `harbor.d2-india.com` |
| Jenkins | `jenkins.d2-india.com` |
| SonarQube | `sonar.d2-india.com` |
| Argo CD | `argocd.d2-india.com` |
| Nexus | `nexus.d2-india.com` |

## Install Order

1. Harbor
2. GitLab CE
3. Jenkins
4. SonarQube
5. Argo CD
6. Demo app
7. Nexus

Harbor before GitLab is useful because Jenkins needs a registry early. GitLab before Jenkins is useful because Jenkins jobs and webhooks need repositories.

## GitOps Rule

Application deployment must flow through Git:

```text
Jenkins build -> Harbor image -> GitOps repo commit -> Argo CD deploy
```

Jenkins should not directly deploy applications with `kubectl apply`.

