#!/usr/bin/env bash
#
# Install or upgrade the bitnami/postgresql chart from the vendored tarball.
# Expects:
#   - namespace `data` already created (`kubectl apply -f ../namespace.yaml`)
#   - Secrets `postgresql-admin` and `postgresql-init-scripts` already applied
#     (run `scripts/apply-secrets.sh` first)
#
# This script is a thin wrapper around `helm upgrade --install`. It intentionally
# does not hide any helm output or exit codes.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
CHART_DIR="${REPO_ROOT}/infra/data/postgresql"
VALUES_FILE="${CHART_DIR}/values.yaml"
NAMESPACE="data"
RELEASE="postgresql"

CHART_TARBALL="$(ls "${CHART_DIR}/charts/"postgresql-*.tgz 2>/dev/null | head -n1 || true)"
if [[ -z "${CHART_TARBALL}" ]]; then
  echo "error: no postgresql chart tarball found under ${CHART_DIR}/charts/" >&2
  echo "       vendor one with: helm pull bitnami/postgresql --version <version> -d ${CHART_DIR}/charts/" >&2
  exit 1
fi

echo "installing ${RELEASE} from ${CHART_TARBALL} into namespace ${NAMESPACE}"

helm upgrade --install "${RELEASE}" "${CHART_TARBALL}" \
  --namespace "${NAMESPACE}" \
  --values "${VALUES_FILE}" \
  --wait \
  --timeout 10m

echo "ok: ${RELEASE} installed. Next:"
echo "  kubectl -n ${NAMESPACE} rollout status statefulset/postgresql"
echo "  kubectl apply -f ${CHART_DIR}/networkpolicy.yaml"
echo "  kubectl -n ${NAMESPACE} exec postgresql-0 -- psql -U postgres -c '\\l'"
