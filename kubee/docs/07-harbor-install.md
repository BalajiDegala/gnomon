# Harbor Lab Install

Harbor is the platform OCI registry. Jenkins will push commit-SHA-tagged images
to Harbor, and Argo CD will deploy those immutable tags from the GitOps repo.

This lab deployment uses the official Harbor Helm chart with:

- the existing nginx Ingress controller
- HTTP at `harbor.d2-india.com`
- persistent registry, PostgreSQL, Redis, job log, and Trivy storage
- Trivy vulnerability scanning
- an admin password generated into a Kubernetes Secret

## Install

```bash
scripts/render-harbor-values.sh config/lab.env
scripts/install-harbor.sh config/lab.env
```

## Watch

```bash
kubectl get pods,pvc,ingress -n harbor
kubectl get pods -n harbor -w
```

## Login

```text
URL: http://harbor.d2-india.com
Username: admin
```

Retrieve the password:

```bash
kubectl -n harbor get secret harbor-admin-password \
  -o jsonpath='{.data.HARBOR_ADMIN_PASSWORD}' | base64 -d; echo
```

## HTTP Registry Note

This lab currently exposes Harbor over HTTP. Docker, containerd, and BuildKit
clients must explicitly trust it as an insecure registry before pushing or
pulling images. Before production use, replace the leaf self-signed issuer with
an internal CA trusted by every node and CI agent, then enable Harbor TLS.

Configure every Kubernetes node with the repository helper while HTTP remains
in use:

```bash
sudo scripts/configure-containerd-harbor.sh config/lab.env
```

The helper supports the containerd configuration formats present on all three
lab nodes, writes `certs.d/harbor.d2-india.com/hosts.toml`, and restarts
containerd. Verify nodes and workloads immediately afterward.

## Next Step

After Harbor is healthy, create a project for application images and deploy
Jenkins. Store Harbor robot-account credentials in Jenkins rather than using
the Harbor admin account in CI.

The verified pipelines use private project `apps` with separate permissions:

- `jenkins/harbor-cicd-registry`: project robot with repository pull/push.
- application namespace registry Secret: separate robot with repository pull
  only.

For an interactive application Secret, use
`scripts/configure-registry-secret.py`. It accepts the robot value through a
hidden prompt, applies `kubernetes.io/dockerconfigjson`, and does not print the
credential.
