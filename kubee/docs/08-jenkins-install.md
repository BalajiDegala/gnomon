# Jenkins Lab Install

Jenkins is the CI orchestrator. It runs the validation and release pipelines on
ephemeral Kubernetes agents; the controller does not execute builds.

This deployment uses:

- the official Jenkins Helm chart
- nginx Ingress at `jenkins.d2-india.com`
- a persistent 20 GiB Jenkins home volume on the shared NFS backend
- an admin password generated into a Kubernetes Secret
- the Kubernetes, Pipeline, Git, GitLab, credentials, SSH agent, and Docker
  Pipeline plugins
- namespace-scoped RBAC without general Kubernetes Secret read access

## Install

```bash
scripts/render-jenkins-values.sh config/lab.env
scripts/install-jenkins.sh config/lab.env
```

The live lab uses existing claim `jenkins-home-nfs`, StorageClass `nfs-shared`,
and `ReadWriteMany`. The installer creates that claim before Helm and the pinned
chart version is `5.9.54`.

Jenkins home was migrated after a content-count and SHA-256 verification. The
old local-path claim `jenkins` remains `Bound` with Helm's keep annotation for
rollback. Do not delete it until an explicit retention decision is made.

## Watch

The first start can take several minutes while Jenkins downloads plugins.

```bash
kubectl get pods,pvc,ingress -n jenkins
kubectl get pods -n jenkins -w
```

## Login

```text
URL: http://jenkins.d2-india.com
Username: admin
```

Retrieve the password:

```bash
kubectl -n jenkins get secret jenkins-admin \
  -o jsonpath='{.data.jenkins-admin-password}' | base64 -d; echo
```

## CI Configuration Order

1. Create a Harbor `apps` project and Jenkins robot account.
2. Add the Harbor robot credentials to Jenkins.
3. Add a GitLab access token or project webhook credential to Jenkins.
4. Configure the imported GitLab project as a Multibranch Pipeline.
5. Add SonarQube after its deployment.
6. Use Kaniko in an ephemeral agent to build and push images without mounting a
   Docker socket.

Jenkins must update the GitOps repository after publishing an immutable image;
it must not run `kubectl apply` for application deployment.

The complete verified reference is in `docs/13-demo-cicd-pipeline.md`. The
Gnomon two-image pipeline and its mandatory SonarQube quality gate are in
`docs/14-gnomon-cicd-onboarding.md`.

## Verify Storage and Service

```bash
kubectl get statefulset,pod,pvc,service,ingress -n jenkins
kubectl exec -n jenkins jenkins-0 -c jenkins -- df -hT /var/jenkins_home
curl --fail http://jenkins.d2-india.com/login >/dev/null
```

The filesystem source must be the NFS CSI path under
`10.191.0.37:/pipedev/k8s-nfs`, not the worker root filesystem.

## Migration or Rebuild

Use `scripts/migrate-jenkins-to-nfs.sh` only when moving an existing local-path
home. It stops Jenkins, copies the old and new claim contents, verifies file
counts and content hashes, and changes the Helm claim only after verification.
For a fresh installation, run `scripts/install-jenkins.sh`; do not run the
migration job.

If the copy job reports an error while preserving the mount-root timestamp,
copy the directory contents rather than the mounted directory itself. The
current manifest already uses that corrected behavior.
