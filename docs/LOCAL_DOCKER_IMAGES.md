# Building Local Docker Images for Gnomon

This guide explains how to build the Gnomon API and web images, test them
locally, make them available to the kubeadm Kubernetes cluster, and deploy the
exact image tags with the Helm chart.

## 1. Prerequisites

Verify the tools first:

```bash
docker version
docker compose version
helm version
kubectl version --client
```

Docker must be able to reach its daemon. If `docker version` reports permission
denied for `/var/run/docker.sock`, either run Docker commands with `sudo` or ask
the server administrator to grant your account Docker access. Membership in the
Docker group is effectively root-level access, so it must be granted carefully.

Run every build command from the repository root:

```bash
cd /dd/ayon/git/gnomon
```

Use the user-owned kubeconfig for cluster commands:

```bash
export KUBECONFIG=/dd/home/balajid/.kube/config
kubectl config current-context
```

### Current local cluster profile

The cluster inspected on 2026-07-27 has:

- One schedulable control-plane node: `dd-test.d2-india.com`.
- Kubernetes installed with kubeadm.
- Container runtime: containerd in the `k8s.io` namespace.
- Architecture: `linux/amd64`.
- NGINX Ingress class: `nginx`.
- Ingress LoadBalancer address: `10.191.0.240`.
- Persistent storage class: `local-path`.
- MongoDB image: `4.4.29`, because the node CPU does not expose AVX instructions
  required by MongoDB 5.0 and later.

Docker and Kubernetes share the same host but use different containerd
namespaces. Docker places images in the `moby` namespace; kubelet looks in the
`k8s.io` namespace. A Docker-built image therefore has to be pushed to a
registry or explicitly imported into `k8s.io`.

## 2. Choose an immutable image tag

Do not deploy `latest` for normal releases. Use a tag that identifies the build,
for example:

```text
0.2.0
0.2.0-20260727
0.2.0-<short-git-commit>
```

The examples below use `0.2.0`. Use the same tag for the API and web images so a
deployed pair can be identified easily.

## 3. Build the images

The final dot in each command is important: it makes the repository root the
Docker build context, allowing the Dockerfile to access all npm workspaces.

For the current single-node kubeadm server, the repository includes a script
that builds, saves, imports, and verifies both images. It asks for sudo once and
automatically uses sudo for Docker too if the current account cannot access the
Docker socket:

```bash
./scripts/build-import-local-images.sh
```

The script reads the release from `package.json` (`0.2.0` currently). An
explicit version can also be supplied:

```bash
./scripts/build-import-local-images.sh 0.2.0
```

The equivalent manual build commands are shown below.

```bash
docker build \
  --file apps/api/Dockerfile \
  --tag gnomon-api:0.2.0 \
  .

docker build \
  --file apps/web/Dockerfile \
  --tag gnomon-web:0.2.0 \
  .
```

Confirm both images exist:

```bash
docker image inspect gnomon-api:0.2.0
docker image inspect gnomon-web:0.2.0
docker images gnomon-api
docker images gnomon-web
```

Build for a specific CPU architecture when the build machine and Kubernetes
server differ:

```bash
docker buildx build \
  --platform linux/amd64 \
  --file apps/api/Dockerfile \
  --tag gnomon-api:0.2.0 \
  --load \
  .
```

Repeat for `apps/web/Dockerfile`. The current kubeadm node is AMD64, so
`linux/amd64` is the correct target.

## 4. Test the images locally

The simplest full-stack test uses Docker Compose:

```bash
docker compose up --build --detach
docker compose ps
docker compose logs --follow api web
```

Open `http://localhost:8080`. Verify the API separately:

```bash
curl --fail http://localhost:8080/api/v1/health/live
curl --fail http://localhost:8080/api/v1/health/ready
```

Stop the stack without deleting MongoDB data:

```bash
docker compose down
```

Do not add `--volumes` unless the development MongoDB data is intentionally
being discarded.

## 5. Make the images available to Kubernetes

Kubernetes cannot automatically see images stored only in Docker's `moby`
namespace. Use either a registry or direct containerd import.

### Option A: Push to a registry (recommended)

Assume the registry is `registry.example.internal:5000`:

```bash
docker login registry.example.internal:5000

docker tag \
  gnomon-api:0.2.0 \
  registry.example.internal:5000/ddi/gnomon-api:0.2.0

docker tag \
  gnomon-web:0.2.0 \
  registry.example.internal:5000/ddi/gnomon-web:0.2.0

docker push registry.example.internal:5000/ddi/gnomon-api:0.2.0
docker push registry.example.internal:5000/ddi/gnomon-web:0.2.0
```

Create a Kubernetes pull secret when the registry requires authentication:

```bash
kubectl create namespace gnomon --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret docker-registry gnomon-registry \
  --namespace gnomon \
  --docker-server=registry.example.internal:5000 \
  --docker-username='<registry-user>' \
  --docker-password='<registry-password>'
```

Never store registry passwords in this repository.

### Option B: Import directly into kubeadm containerd

This is the simplest option for the current single-node server when no registry
is required:

```bash
docker save \
  --output /tmp/gnomon-0.2.0-images.tar \
  gnomon-api:0.2.0 \
  gnomon-web:0.2.0

sudo ctr \
  --address /var/run/containerd/containerd.sock \
  --namespace k8s.io \
  images import /tmp/gnomon-0.2.0-images.tar

sudo ctr \
  --address /var/run/containerd/containerd.sock \
  --namespace k8s.io \
  images list | grep gnomon
```

For a multi-node cluster, import the archive on every node that may run a Gnomon
pod. A registry is preferable for multi-node operation.

When directly importing images, use `IfNotPresent` and the exact local image
names in Helm. Do not use `Always`, because Kubernetes would try to pull them
from an external registry.

## 6. Create an uncommitted Helm values file

Create `private-values.yaml` outside Git or keep it ignored. The repository
ignores `private-values*.yaml`; still verify that no secret values are staged or
committed.

For registry images:

```yaml
imagePullSecrets:
  - name: gnomon-registry

web:
  image:
    repository: registry.example.internal:5000/ddi/gnomon-web
    tag: '0.2.0'
    pullPolicy: IfNotPresent

api:
  image:
    repository: registry.example.internal:5000/ddi/gnomon-api
    tag: '0.2.0'
    pullPolicy: IfNotPresent
  webOrigin: http://gnomon.local

ingress:
  enabled: true
  className: nginx
  host: gnomon.local

secrets:
  existingSecret: gnomon-runtime
```

The recommended deployment creates `gnomon-runtime` directly in Kubernetes so
its values do not become Helm release values:

```bash
kubectl create secret generic gnomon-runtime \
  --namespace gnomon \
  --from-literal=ACCESS_TOKEN_SECRET='<at-least-32-random-characters>' \
  --from-literal=REFRESH_TOKEN_SECRET='<a-different-32-character-secret>' \
  --from-literal=MONGO_INITDB_ROOT_PASSWORD='<url-safe-mongodb-password>' \
  --from-literal=MONGODB_URI='mongodb://gnomonadmin:<url-safe-mongodb-password>@gnomon-gnomon-mongodb:27017/gnomon?authSource=admin'
```

Alternatively, if Helm should create the Secret, omit `existingSecret` and use
an uncommitted values file containing:

```yaml
secrets:
  accessTokenSecret: '<at-least-32-random-characters>'
  refreshTokenSecret: '<a-different-32-character-secret>'
  mongodbRootPassword: '<url-safe-mongodb-password>'
  mongodbUri: 'mongodb://gnomonadmin:<url-safe-mongodb-password>@gnomon-gnomon-mongodb:27017/gnomon?authSource=admin'
```

For images imported directly into kubeadm containerd, omit `imagePullSecrets`
and use:

```yaml
web:
  image:
    repository: gnomon-web
    tag: '0.2.0'
    pullPolicy: IfNotPresent

api:
  image:
    repository: gnomon-api
    tag: '0.2.0'
    pullPolicy: IfNotPresent

mongodb:
  storageClassName: local-path

ingress:
  className: nginx
  host: gnomon.local
```

Generate strong values without printing or committing them through application
logs. One common local command is:

```bash
openssl rand -hex 32
```

If the MongoDB password contains reserved URL characters, URL-encode it in
`mongodbUri` or use a URL-safe password.

## 7. Validate and deploy with Helm

Render and inspect the manifests before applying them:

```bash
helm lint deploy/helm/gnomon --values private-values.yaml

helm template gnomon deploy/helm/gnomon \
  --namespace gnomon \
  --values private-values.yaml
```

Install or upgrade:

```bash
helm upgrade --install gnomon deploy/helm/gnomon \
  --namespace gnomon \
  --create-namespace \
  --values private-values.yaml \
  --wait \
  --timeout 5m
```

Verify the deployment:

```bash
kubectl get pods,services,ingress --namespace gnomon
kubectl rollout status deployment/gnomon-gnomon-api --namespace gnomon
kubectl rollout status deployment/gnomon-gnomon-web --namespace gnomon
kubectl logs deployment/gnomon-gnomon-api --namespace gnomon
```

Add the Ingress host to local DNS or `/etc/hosts`, pointing it at the NGINX
Ingress LoadBalancer address, and then open `http://gnomon.local`:

```text
10.191.0.240 gnomon.local
```

## 8. Publish and deploy a later version

Build a new immutable tag; do not replace the old tag:

```bash
docker build --file apps/api/Dockerfile --tag gnomon-api:0.2.0 .
docker build --file apps/web/Dockerfile --tag gnomon-web:0.2.0 .
```

Push or import the images, update both tags in `private-values.yaml`, and run the
same `helm upgrade --install` command. Monitor the rollout:

```bash
kubectl get pods --namespace gnomon --watch
helm history gnomon --namespace gnomon
```

Rollback if necessary:

```bash
helm rollback gnomon <revision-number> --namespace gnomon --wait
```

## 9. Common problems

### `ImagePullBackOff`

- Confirm the repository and tag in `private-values.yaml`.
- Confirm the Kubernetes node can resolve and reach the registry.
- Confirm `gnomon-registry` exists in the `gnomon` namespace.
- Use `kubectl describe pod <pod-name> --namespace gnomon` for the exact error.

### `ErrImageNeverPull`

The image is missing from containerd's `k8s.io` namespace. Import it with
`ctr --namespace k8s.io images import`, or change Helm to use a reachable
registry.

### Pod uses an old image

Use immutable tags. Update the Helm tag on every release. If a tag was reused
during local experimentation, import it again and restart the deployment:

```bash
kubectl rollout restart deployment/gnomon-gnomon-api --namespace gnomon
kubectl rollout restart deployment/gnomon-gnomon-web --namespace gnomon
```

### Architecture mismatch

An `exec format error` usually means an AMD64 image was deployed on ARM64 or the
reverse. Rebuild with the correct `docker buildx --platform` setting.

## 10. Release checklist

- Run `npm run typecheck`, `npm test`, and `npm run build`.
- Run `npm audit` and review the result.
- Choose a new immutable tag.
- Build both images from the repository root.
- Test the images with Compose.
- Push to the registry or import into every kubeadm node.
- Update both Helm image tags.
- Run Helm lint and template checks.
- Deploy with `--wait` and verify both rollouts.
- Record the Helm revision and deployed image tags.
