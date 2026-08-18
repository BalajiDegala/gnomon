# platform-gitops seed

This directory is the seed content for the private GitLab repository configured
by `GITOPS_REPO_URL`. Argo CD watches `clusters/lab/apps` for child Application
resources. Application workload manifests live in separate directories so the
root Application remains a small app-of-apps entry point.

Do not commit repository passwords, deploy tokens, kubeconfigs, or application
Secrets. Use External Secrets when that add-on is introduced.
