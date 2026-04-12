#!/usr/bin/env bash
#
# Render and apply the finbrain Secret objects from the local source files.
#
# Sources:
#   - infra/.secrets/postgresql.env  (FINBRAIN_DB_PASSWORD)
#   - infra/.secrets/finbrain.env    (FINBRAIN_FIREFLY_TOKEN, FINBRAIN_GHOSTFOLIO_TOKEN)
#
# Produces:
#   - Secret finbrain-app-secrets    (FINBRAIN_DATABASE_URL assembled against the
#                                     shared data/postgresql instance, + external tokens)
#
# NOTE: finbrain-backup-secrets is intentionally NOT generated here. The backup
# CronJob is still pointing at a placeholder external S3 that was never actually
# configured; it will be rewritten in a follow-up change along with the pg +
# uploads backup strategy.
#
# Idempotent: safe to re-run.
# Prerequisite: namespace `finbrain` already exists (e.g. via `kubectl apply -k`).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
PG_ENV="${REPO_ROOT}/infra/.secrets/postgresql.env"
APP_ENV="${REPO_ROOT}/infra/.secrets/finbrain.env"
NAMESPACE="finbrain"

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

: "${FINBRAIN_DB_PASSWORD:?FINBRAIN_DB_PASSWORD missing in ${PG_ENV}}"
: "${FINBRAIN_FIREFLY_TOKEN:?FINBRAIN_FIREFLY_TOKEN missing in ${APP_ENV}}"
: "${FINBRAIN_GHOSTFOLIO_TOKEN:?FINBRAIN_GHOSTFOLIO_TOKEN missing in ${APP_ENV}}"

if ! kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
  echo "error: namespace ${NAMESPACE} does not exist" >&2
  echo "       create it first: kubectl apply -f infra/apps/finbrain/namespace.yaml" >&2
  exit 1
fi

DATABASE_URL="postgresql+psycopg://finbrain:${FINBRAIN_DB_PASSWORD}@postgresql.data.svc.cluster.local:5432/finbrain"

kubectl -n "${NAMESPACE}" create secret generic finbrain-app-secrets \
  --from-literal=FINBRAIN_DATABASE_URL="${DATABASE_URL}" \
  --from-literal=FINBRAIN_FIREFLY_TOKEN="${FINBRAIN_FIREFLY_TOKEN}" \
  --from-literal=FINBRAIN_GHOSTFOLIO_TOKEN="${FINBRAIN_GHOSTFOLIO_TOKEN}" \
  --dry-run=client -o yaml \
  | kubectl apply -f -

echo "ok: finbrain-app-secrets applied to namespace ${NAMESPACE}"
