#!/usr/bin/env bash
#
# Deploy the shared PostgreSQL via the local Helm chart (chart/) with the gz overlay.
# 用官方 postgres:17-alpine（chart 里只是纯 manifest 封装,不是 bitnami——bitnami 镜像墙内拉不到)。
#
# Prerequisites:
#   - 切到主集群 context:kubectl config use-context homelab-default
#   - namespace data 已建:kubectl apply -f infra/data/postgresql/namespace.yaml
#   - Secrets postgresql-admin + postgresql-init-scripts 已生成:bash scripts/apply-secrets.sh
#
# 全新集群直接跑本脚本即可。若是【接管已有的裸 kubectl apply 资源】(Helm 4 server-side-apply
# 会和 kubectl-client-side-apply 冲突),先删掉 StatefulSet/Service(PVC retentionPolicy=Retain,
# 数据保留)再跑:
#   kubectl -n data delete statefulset/postgresql service/postgresql
#   # NUC 还有 service/postgresql-nodeport

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
PG="${REPO_ROOT}/infra/data/postgresql"
NAMESPACE="data"

helm upgrade --install postgresql "${PG}/chart" -n "${NAMESPACE}" -f "${PG}/values-gz.yaml"

echo "waiting for postgresql-0 to be ready..."
kubectl -n "${NAMESPACE}" rollout status statefulset/postgresql --timeout=5m

echo "ok: postgresql deployed. Verify:"
echo "  kubectl -n ${NAMESPACE} exec postgresql-0 -- psql -U postgres -c '\\l'"
echo "  kubectl -n ${NAMESPACE} exec postgresql-0 -- psql -U postgres -c '\\du'"
