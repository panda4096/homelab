#!/usr/bin/env bash
#
# Sync only the PostgreSQL admin password Secret for the NUC dev instance.
# This script intentionally does not create init SQL or application databases.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd)"
ENV_FILE="${REPO_ROOT}/infra/.secrets/postgresql.env"
NAMESPACE="data"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "error: ${ENV_FILE} not found" >&2
  echo "       create it based on infra/.secrets/README.md" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "${ENV_FILE}"
set +a

: "${POSTGRES_ADMIN_PASSWORD:?POSTGRES_ADMIN_PASSWORD missing in ${ENV_FILE}}"

if ! kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
  echo "error: namespace ${NAMESPACE} does not exist" >&2
  echo "       run: kubectl apply -f infra/data/postgresql/namespace.yaml" >&2
  exit 1
fi

kubectl -n "${NAMESPACE}" create secret generic postgresql-admin \
  --from-literal=postgres-password="${POSTGRES_ADMIN_PASSWORD}" \
  --dry-run=client -o yaml \
  | kubectl apply -f -

echo "ok: postgresql-admin applied to namespace ${NAMESPACE}"
