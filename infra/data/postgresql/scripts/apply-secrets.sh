#!/usr/bin/env bash
#
# Sync the admin password Secret and the init-scripts Secret for the shared
# bitnami/postgresql instance in namespace `data`.
#
# Reads plaintext passwords from `infra/.secrets/postgresql.env` and produces:
#   - Secret `postgresql-admin`          (used by values.yaml `auth.existingSecret`)
#   - Secret `postgresql-init-scripts`   (used by values.yaml `primary.initdb.scriptsSecret`)
#
# Idempotent: uses `kubectl create secret --dry-run=client -o yaml | kubectl apply -f -`.
# Must be run BEFORE `scripts/helm-install.sh` on first bring-up.
# Safe to re-run; re-running after the chart is installed only refreshes the
# Secret objects. Password rotation for existing users still requires a manual
# `ALTER USER ... PASSWORD ...` inside the running Postgres.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
ENV_FILE="${REPO_ROOT}/infra/.secrets/postgresql.env"
SQL_TEMPLATE="${REPO_ROOT}/infra/data/postgresql/init-scripts/01-create-app-databases.sql"
NAMESPACE="data"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "error: ${ENV_FILE} not found" >&2
  echo "       copy or create it based on infra/.secrets/README.md" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "${ENV_FILE}"
set +a

: "${POSTGRES_ADMIN_PASSWORD:?POSTGRES_ADMIN_PASSWORD missing in ${ENV_FILE}}"
: "${FIREFLY_DB_PASSWORD:?FIREFLY_DB_PASSWORD missing in ${ENV_FILE}}"
: "${GHOSTFOLIO_DB_PASSWORD:?GHOSTFOLIO_DB_PASSWORD missing in ${ENV_FILE}}"
: "${FINBRAIN_DB_PASSWORD:?FINBRAIN_DB_PASSWORD missing in ${ENV_FILE}}"

if ! kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
  echo "error: namespace ${NAMESPACE} does not exist" >&2
  echo "       run: kubectl apply -f infra/data/postgresql/namespace.yaml" >&2
  exit 1
fi

# --- postgresql-admin -------------------------------------------------------

kubectl -n "${NAMESPACE}" create secret generic postgresql-admin \
  --from-literal=postgres-password="${POSTGRES_ADMIN_PASSWORD}" \
  --dry-run=client -o yaml \
  | kubectl apply -f -

# --- postgresql-init-scripts ------------------------------------------------
# Substitute password placeholders with real values using Python so that
# arbitrary characters in the passwords (including `/`, `&`, `$`) are
# handled without relying on envsubst or sed quoting.

RENDERED_SQL="$(
  FIREFLY_DB_PASSWORD="${FIREFLY_DB_PASSWORD}" \
  GHOSTFOLIO_DB_PASSWORD="${GHOSTFOLIO_DB_PASSWORD}" \
  FINBRAIN_DB_PASSWORD="${FINBRAIN_DB_PASSWORD}" \
  python3 -c '
import os, sys, pathlib
text = pathlib.Path(sys.argv[1]).read_text()
for key in ("FIREFLY_DB_PASSWORD", "GHOSTFOLIO_DB_PASSWORD", "FINBRAIN_DB_PASSWORD"):
    text = text.replace("${" + key + "}", os.environ[key])
sys.stdout.write(text)
' "${SQL_TEMPLATE}"
)"

kubectl -n "${NAMESPACE}" create secret generic postgresql-init-scripts \
  --from-literal=01-create-app-databases.sql="${RENDERED_SQL}" \
  --dry-run=client -o yaml \
  | kubectl apply -f -

echo "ok: postgresql-admin and postgresql-init-scripts applied to namespace ${NAMESPACE}"
