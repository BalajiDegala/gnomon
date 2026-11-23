#!/usr/bin/env bash
# Build the Gnomon API and web images and push them to Docker Hub.
#
#   DOCKERHUB_USER=<your-user> scripts/push-dockerhub-images.sh [tag]
#
# The default tag is <package version>-<git short sha> (e.g. 0.11.0-4455f11), so every
# commit gets a new tag and Kubernetes always rolls out the new code. Run
# `docker login -u "$DOCKERHUB_USER"` (with an access token) once beforehand.

set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repository_root="$(cd -- "${script_dir}/.." && pwd -P)"
cd -- "${repository_root}"

if [[ -z ${DOCKERHUB_USER:-} || ${DOCKERHUB_USER} == DOCKERHUB_USER ]]; then
  echo "Set DOCKERHUB_USER to your Docker Hub username." >&2
  exit 1
fi
if [[ ! ${DOCKERHUB_USER} =~ ^[a-z0-9]+([._-][a-z0-9]+)*$ ]]; then
  echo "Invalid Docker Hub username: ${DOCKERHUB_USER}" >&2
  exit 1
fi

version="$(node -p "require('./package.json').version")"
default_tag="${version}-$(git rev-parse --short HEAD)"
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  default_tag="${default_tag}-dirty-$(date +%Y%m%d%H%M)"
fi
tag="${1:-${default_tag}}"
if [[ ! ${tag} =~ ^[0-9A-Za-z][0-9A-Za-z._-]{0,127}$ ]]; then
  echo "Invalid image tag: ${tag}" >&2
  exit 1
fi
hyde
docker_command=(docker)
if ! docker info >/dev/null 2>&1; then
  echo "Docker is not accessible as $(id -un); using sudo."
  docker_command=(sudo docker)
fi

api_image="docker.io/${DOCKERHUB_USER}/gnomon-api:${tag}"
web_image="docker.io/${DOCKERHUB_USER}/gnomon-web:${tag}"

echo "Building ${api_image}..."
"${docker_command[@]}" build --platform linux/amd64 --file apps/api/Dockerfile --tag "${api_image}" .
echo "Building ${web_image}..."
"${docker_command[@]}" build --platform linux/amd64 --file apps/web/Dockerfile --tag "${web_image}" .

echo "Pushing images..."
"${docker_command[@]}" push "${api_image}"
"${docker_command[@]}" push "${web_image}"

cat <<EOF

Pushed:
  ${api_image}
  ${web_image}

Deploy this tag:
  Helm:       helm upgrade --install gnomon deploy/helm/gnomon -n gnomon \\
                -f deploy/helm/gnomon/values-dockerhub.yaml -f <private-values.yaml> \\
                --set api.image.repository=docker.io/${DOCKERHUB_USER}/gnomon-api \\
                --set web.image.repository=docker.io/${DOCKERHUB_USER}/gnomon-web \\
                --set adminSeed.image.repository=docker.io/${DOCKERHUB_USER}/gnomon-api \\
                --set-string api.image.tag=${tag},web.image.tag=${tag},adminSeed.image.tag=${tag}
  Kubernetes: sed -i -E 's#(newName: docker.io/)[^/]+/#\1${DOCKERHUB_USER}/#; s#(newTag: ).*#\1"${tag}"#' \
                deploy/kubernetes/kustomization.yaml && kubectl apply -k deploy/kubernetes
EOF
