#!/usr/bin/env bash

set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repository_root="$(cd -- "${script_dir}/.." && pwd -P)"

for required_command in node docker ctr; do
  if ! command -v "${required_command}" >/dev/null 2>&1; then
    echo "Required command not found: ${required_command}" >&2
    exit 1
  fi
done

if [[ ${EUID} -eq 0 ]]; then
  privileged=()
else
  if ! command -v sudo >/dev/null 2>&1; then
    echo "sudo is required to import images into kubeadm containerd." >&2
    exit 1
  fi

  echo "Authenticating sudo once for the containerd import..."
  sudo -v
  privileged=(sudo)
fi

default_version="$(node -p "require('${repository_root}/package.json').version")"
release_version="${1:-${default_version}}"

if [[ ! ${release_version} =~ ^[0-9A-Za-z][0-9A-Za-z._-]*$ ]]; then
  echo "Invalid image version: ${release_version}" >&2
  exit 1
fi

docker_binary="$(command -v docker)"
ctr_binary="$(command -v ctr)"
docker_command=("${docker_binary}")

if ! "${docker_command[@]}" info >/dev/null 2>&1; then
  echo "Docker is not accessible as the current user; using sudo for Docker."
  docker_command=("${privileged[@]}" "${docker_binary}")
  "${docker_command[@]}" info >/dev/null
fi

api_image="gnomon-api:${release_version}"
web_image="gnomon-web:${release_version}"
image_archive="/tmp/gnomon-${release_version}-images.tar"

cd -- "${repository_root}"

echo "Building ${api_image} for linux/amd64..."
"${docker_command[@]}" build \
  --platform linux/amd64 \
  --file apps/api/Dockerfile \
  --tag "${api_image}" \
  .

echo "Building ${web_image} for linux/amd64..."
"${docker_command[@]}" build \
  --platform linux/amd64 \
  --file apps/web/Dockerfile \
  --tag "${web_image}" \
  .

echo "Saving both images to ${image_archive}..."
"${docker_command[@]}" save \
  --output "${image_archive}" \
  "${api_image}" \
  "${web_image}"

echo "Importing images into containerd namespace k8s.io..."
"${privileged[@]}" "${ctr_binary}" \
  --address /var/run/containerd/containerd.sock \
  --namespace k8s.io \
  images import "${image_archive}"

echo "Verifying imported Gnomon images..."
"${privileged[@]}" "${ctr_binary}" \
  --address /var/run/containerd/containerd.sock \
  --namespace k8s.io \
  images list | grep -E "gnomon-(api|web):${release_version}"

echo
echo "Local Kubernetes images are ready:"
echo "  ${api_image}"
echo "  ${web_image}"
echo "Archive: ${image_archive}"
echo "The Helm deployment can now be upgraded to ${release_version}."
