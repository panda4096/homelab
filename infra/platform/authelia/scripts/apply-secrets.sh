#!/usr/bin/env bash
#
# Render and apply the Authelia runtime Secret objects from the local source files.
#
# Sources:
#   - infra/.secrets/authelia-bootstrap.env
#   - infra/.secrets/authelia-users-database.yml
#
# Produces:
#   - Secret authelia-secrets (session/storage/SMTP/OIDC runtime secrets)
#   - Secret authelia-users   (file backend users database)
#
# Idempotent: safe to re-run.
# Prerequisite: namespace `authelia` already exists.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
BOOTSTRAP_ENV="${REPO_ROOT}/infra/.secrets/authelia-bootstrap.env"
USERS_FILE="${REPO_ROOT}/infra/.secrets/authelia-users-database.yml"
NAMESPACE="authelia"

for f in "${BOOTSTRAP_ENV}" "${USERS_FILE}"; do
  if [[ ! -f "${f}" ]]; then
    echo "error: ${f} not found" >&2
    exit 1
  fi
done

set -a
# shellcheck disable=SC1090
source "${BOOTSTRAP_ENV}"
set +a

: "${AUTHELIA_SESSION_SECRET:?AUTHELIA_SESSION_SECRET missing in ${BOOTSTRAP_ENV}}"
: "${AUTHELIA_STORAGE_SECRET:?AUTHELIA_STORAGE_SECRET missing in ${BOOTSTRAP_ENV}}"
: "${AUTHELIA_SMTP_PASSWORD:?AUTHELIA_SMTP_PASSWORD missing in ${BOOTSTRAP_ENV}}"
: "${AUTHELIA_IDENTITY_VALIDATION_RESET_PASSWORD_JWT_SECRET:?AUTHELIA_IDENTITY_VALIDATION_RESET_PASSWORD_JWT_SECRET missing in ${BOOTSTRAP_ENV}}"
: "${AUTHELIA_IDENTITY_PROVIDERS_OIDC_HMAC_SECRET:?AUTHELIA_IDENTITY_PROVIDERS_OIDC_HMAC_SECRET missing in ${BOOTSTRAP_ENV}}"
: "${AUTHELIA_IDENTITY_PROVIDERS_OIDC_JWKS_0_KEY:?AUTHELIA_IDENTITY_PROVIDERS_OIDC_JWKS_0_KEY missing in ${BOOTSTRAP_ENV}}"
: "${AUTHELIA_OIDC_GHOSTFOLIO_CLIENT_SECRET:?AUTHELIA_OIDC_GHOSTFOLIO_CLIENT_SECRET missing in ${BOOTSTRAP_ENV}}"

if ! kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
  echo "error: namespace ${NAMESPACE} does not exist" >&2
  echo "       create it first: kubectl apply -f infra/platform/authelia/namespace.yaml" >&2
  exit 1
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

printf '%s\n' "${AUTHELIA_IDENTITY_PROVIDERS_OIDC_JWKS_0_KEY}" > "${tmpdir}/oidc.jwk.RS256.pem"

kubectl -n "${NAMESPACE}" create secret generic authelia-secrets \
  --from-literal=identity_validation.reset_password.jwt.hmac.key="${AUTHELIA_IDENTITY_VALIDATION_RESET_PASSWORD_JWT_SECRET}" \
  --from-literal=session.encryption.key="${AUTHELIA_SESSION_SECRET}" \
  --from-literal=storage.encryption.key="${AUTHELIA_STORAGE_SECRET}" \
  --from-literal=notifier.smtp.password.txt="${AUTHELIA_SMTP_PASSWORD}" \
  --from-literal=identity_providers.oidc.hmac.key="${AUTHELIA_IDENTITY_PROVIDERS_OIDC_HMAC_SECRET}" \
  --from-literal=oidc.client.ghostfolio.value="${AUTHELIA_OIDC_GHOSTFOLIO_CLIENT_SECRET}" \
  --from-file=oidc.jwk.RS256.pem="${tmpdir}/oidc.jwk.RS256.pem" \
  --dry-run=client -o yaml \
  | kubectl apply -f -

kubectl -n "${NAMESPACE}" create secret generic authelia-users \
  --from-file=users_database.yml="${USERS_FILE}" \
  --dry-run=client -o yaml \
  | kubectl apply -f -

echo "ok: authelia-secrets / authelia-users applied to namespace ${NAMESPACE}"
