#!/usr/bin/env bash
#
# Render and apply the Ghostfolio Secret objects from the local source files.
#
# Sources:
#   - infra/.secrets/postgresql.env  (GHOSTFOLIO_DB_PASSWORD)
#   - infra/.secrets/ghostfolio.env  (GHOSTFOLIO_ACCESS_TOKEN_SALT,
#                                     GHOSTFOLIO_JWT_SECRET_KEY,
#                                     GHOSTFOLIO_OIDC_CLIENT_SECRET,
#                                     GHOSTFOLIO_REDIS_PASSWORD)
#
# Produces:
#   - Secret ghostfolio-app-secrets    (ACCESS_TOKEN_SALT, JWT_SECRET_KEY,
#                                       OIDC_CLIENT_SECRET)
#   - Secret ghostfolio-db-credentials (database-url assembled against shared
#                                       data/postgresql)
#   - Secret ghostfolio-redis-secrets  (redis-password, consumed by the
#                                       in-namespace redis Deployment)
#
# Idempotent: safe to re-run.
# Prerequisite: namespace `ghostfolio` already exists.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
PG_ENV="${REPO_ROOT}/infra/.secrets/postgresql.env"
APP_ENV="${REPO_ROOT}/infra/.secrets/ghostfolio.env"
NAMESPACE="ghostfolio"

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

: "${GHOSTFOLIO_DB_PASSWORD:?GHOSTFOLIO_DB_PASSWORD missing in ${PG_ENV}}"
: "${GHOSTFOLIO_ACCESS_TOKEN_SALT:?GHOSTFOLIO_ACCESS_TOKEN_SALT missing in ${APP_ENV}}"
: "${GHOSTFOLIO_JWT_SECRET_KEY:?GHOSTFOLIO_JWT_SECRET_KEY missing in ${APP_ENV}}"
: "${GHOSTFOLIO_OIDC_CLIENT_SECRET:?GHOSTFOLIO_OIDC_CLIENT_SECRET missing in ${APP_ENV}}"
: "${GHOSTFOLIO_REDIS_PASSWORD:?GHOSTFOLIO_REDIS_PASSWORD missing in ${APP_ENV}}"

if ! kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
  echo "error: namespace ${NAMESPACE} does not exist" >&2
  echo "       create it first: kubectl apply -f infra/apps/ghostfolio/namespace.yaml" >&2
  exit 1
fi

DATABASE_URL="postgresql://ghostfolio:${GHOSTFOLIO_DB_PASSWORD}@postgresql.data.svc.cluster.local:5432/ghostfolio?schema=public"

kubectl -n "${NAMESPACE}" create secret generic ghostfolio-app-secrets \
  --from-literal=ACCESS_TOKEN_SALT="${GHOSTFOLIO_ACCESS_TOKEN_SALT}" \
  --from-literal=JWT_SECRET_KEY="${GHOSTFOLIO_JWT_SECRET_KEY}" \
  --from-literal=OIDC_CLIENT_SECRET="${GHOSTFOLIO_OIDC_CLIENT_SECRET}" \
  --dry-run=client -o yaml \
  | kubectl apply -f -

kubectl -n "${NAMESPACE}" create secret generic ghostfolio-db-credentials \
  --from-literal=database-url="${DATABASE_URL}" \
  --dry-run=client -o yaml \
  | kubectl apply -f -

kubectl -n "${NAMESPACE}" create secret generic ghostfolio-redis-secrets \
  --from-literal=redis-password="${GHOSTFOLIO_REDIS_PASSWORD}" \
  --dry-run=client -o yaml \
  | kubectl apply -f -

echo "ok: ghostfolio-app-secrets / ghostfolio-db-credentials / ghostfolio-redis-secrets applied to namespace ${NAMESPACE}"
