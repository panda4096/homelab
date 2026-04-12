#!/usr/bin/env bash
#
# Deploy the shared PostgreSQL instance into namespace `data`.
# Uses plain manifests + official postgres:17-alpine image (no Helm).
#
# Prerequisites:
#   - namespace `data` already created
#   - Secrets `postgresql-admin` and `postgresql-init-scripts` already applied
#     (run `scripts/apply-secrets.sh` first)
#
# The vendored bitnami chart under `charts/` is kept for reference but NOT used,
# because docker.io/bitnami/postgresql images were removed post-Broadcom acquisition
# and registry.bitnami.com is unreachable from China-based nodes.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
CHART_DIR="${REPO_ROOT}/infra/data/postgresql"
NAMESPACE="data"

echo "applying postgresql manifests into namespace ${NAMESPACE}"

kubectl apply -f "${CHART_DIR}/namespace.yaml"
kubectl apply -f "${CHART_DIR}/postgresql-service.yaml"
kubectl apply -f "${CHART_DIR}/postgresql-statefulset.yaml"
kubectl apply -f "${CHART_DIR}/networkpolicy.yaml"

echo "waiting for postgresql-0 to be ready..."
kubectl -n "${NAMESPACE}" rollout status statefulset/postgresql --timeout=5m

echo "ok: postgresql deployed. Verify:"
echo "  kubectl -n ${NAMESPACE} exec postgresql-0 -- psql -U postgres -c '\\l'"
echo "  kubectl -n ${NAMESPACE} exec postgresql-0 -- psql -U postgres -c '\\du'"
