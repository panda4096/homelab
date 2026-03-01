#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
OUT_DIR="${ROOT_DIR}/infra/.secrets"
OUT_FILE="${OUT_DIR}/homelab-k3s.yaml"

API_ENDPOINT="${API_ENDPOINT:-gz.butcoder.com}"
MASTER_SSH="${MASTER_SSH:-gz.butcoder.com}"

mkdir -p "${OUT_DIR}"

TMP="$(mktemp)"
trap 'rm -f "${TMP}"' EXIT

scp -o StrictHostKeyChecking=no "${MASTER_SSH}:/etc/rancher/k3s/k3s.yaml" "${TMP}"
perl -pi -e "s/127\\.0\\.0\\.1/${API_ENDPOINT}/g" "${TMP}"

install -m 600 "${TMP}" "${OUT_FILE}"

echo "kubeconfig written to: ${OUT_FILE}"
echo "Use:"
echo "  export KUBECONFIG=\"${OUT_FILE}\""
echo "  kubectl get nodes -o wide"

