#!/usr/bin/env bash
#
# Render and apply the Firefly III Secret objects from the local source files.
#
# Sources:
#   - infra/.secrets/postgresql.env  (FIREFLY_DB_PASSWORD)
#   - infra/.secrets/firefly.env     (FIREFLY_APP_KEY, FIREFLY_SITE_OWNER)
#
# Produces:
#   - Secret firefly-app-secrets     (APP_KEY, SITE_OWNER)
#   - Secret firefly-db-credentials  (postgres-user, postgres-password — used by
#                                     firefly-deployment.yaml env DB_USERNAME/DB_PASSWORD)
#
# Idempotent: safe to re-run.
# Prerequisite: namespace `firefly` already exists.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
PG_ENV="${REPO_ROOT}/infra/.secrets/postgresql.env"
APP_ENV="${REPO_ROOT}/infra/.secrets/firefly.env"
NAMESPACE="firefly"

for f in "${PG_ENV}" "${APP_ENV}"; do
  if [[ ! -f "${f}" ]]; then
    echo "error: ${f} not found" >&2
    exit 1
  fi
done

set -a
# shellcheck disable=SC1090
source "${PG_ENV}"
# shellcheck disable=SC1090
source "${APP_ENV}"
set +a

: "${FIREFLY_DB_PASSWORD:?FIREFLY_DB_PASSWORD missing in ${PG_ENV}}"
: "${FIREFLY_APP_KEY:?FIREFLY_APP_KEY missing in ${APP_ENV}}"
: "${FIREFLY_SITE_OWNER:?FIREFLY_SITE_OWNER missing in ${APP_ENV}}"

if ! kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
  echo "error: namespace ${NAMESPACE} does not exist" >&2
  echo "       create it first: kubectl apply -f infra/apps/firefly/namespace.yaml" >&2
  exit 1
fi

kubectl -n "${NAMESPACE}" create secret generic firefly-app-secrets \
  --from-literal=APP_KEY="${FIREFLY_APP_KEY}" \
  --from-literal=SITE_OWNER="${FIREFLY_SITE_OWNER}" \
  --dry-run=client -o yaml \
  | kubectl apply -f -

kubectl -n "${NAMESPACE}" create secret generic firefly-db-credentials \
  --from-literal=postgres-user="firefly" \
  --from-literal=postgres-password="${FIREFLY_DB_PASSWORD}" \
  --dry-run=client -o yaml \
  | kubectl apply -f -

echo "ok: firefly-app-secrets and firefly-db-credentials applied to namespace ${NAMESPACE}"
