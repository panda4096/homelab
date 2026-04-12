# finbrain（自研接入与聚合层）

本目录维护 `finbrain ingest-agent`、review UI 和 dashboard 在当前 homelab 中的部署资产。

## 职责

- 接收 HSBC PDF / 截图、Futu CSV、后续 Futu OpenAPI 数据
- normalize 到统一 `Activity schema`
- 按 `(source, source_ref)` 幂等去重
- 提供 review UI、审计、异常队列和 dashboard

## 默认访问地址

- `https://106.55.163.135/finbrain/`

## 资源清单

- `namespace.yaml`
- `finbrain-configmap.yaml`
- `finbrain-uploads-pvc.yaml`
- `finbrain-deployment.yaml`
- `finbrain-service.yaml`
- `finbrain-forwardauth-middleware.yaml`
- `finbrain-httproute.yaml`
- `finbrain-networkpolicy.yaml`
- `finbrain-db-backup-cronjob.yaml`（待改造，见下）
- `kustomization.yaml`
- `scripts/apply-secrets.sh`（生成 `finbrain-app-secrets`）
- `scripts/smoke-test.sh` / `scripts/local-api-check.sh`

## 前置依赖

finbrain 不再自带 Postgres，数据库使用共享的 `infra/data/postgresql/`（namespace `data`）。部署 finbrain 前必须：

1. `infra/data/postgresql` 已就绪
2. `finbrain` 数据库 + `finbrain` 用户已通过 init 脚本创建
3. `infra/.secrets/postgresql.env` 和 `infra/.secrets/finbrain.env` 都填了真值

## 首次部署

```bash
# 1. 构建并推送镜像（按需）
cd finbrain/ingest-agent && docker build -t ghcr.io/panda4096/finbrain-ingest-agent:<tag> .
docker push ghcr.io/panda4096/finbrain-ingest-agent:<tag>

# 2. 应用 namespace（kustomize build 会创建，但 apply-secrets.sh 依赖 namespace 存在）
cd <repo-root>
kubectl apply -f infra/apps/finbrain/namespace.yaml

# 3. 生成 finbrain-app-secrets
bash infra/apps/finbrain/scripts/apply-secrets.sh

# 4. apply 剩余资源
kubectl apply -k infra/apps/finbrain

# 5. 等待就绪
kubectl -n finbrain rollout status deploy/finbrain
kubectl -n finbrain get pvc finbrain-uploads
```

## 认证

- Web UI 统一走 `Authelia ForwardAuth`
- ingest-agent 到 Firefly / Ghostfolio 的写入凭据使用独立 Secret

## 数据与存储

- 数据库：`postgresql.data.svc.cluster.local:5432/finbrain`，用户 `finbrain`
- 原始凭证（HSBC PDF、Futu CSV 原件等）：PVC `finbrain-uploads`，挂载到 pod 的 `/var/finbrain/uploads`
- PVC storageClass `local-path`，初始容量 1Gi；扩容用 `kubectl -n finbrain edit pvc finbrain-uploads`

## 已知限制 / 待改造

- `finbrain-db-backup-cronjob.yaml` 当前仍引用 `finbrain-backup-secrets` 里的外部 S3 字段。这些 S3 字段是早期 agent 生成的占位，**实际未配置**。Phase 1 之前会单独一单重新决策 pg + uploads 的备份方案（两节点内部同步 / 真外部对象存储二选一），届时这个 CronJob 会被重写。
- `finbrain-uploads` PVC 只绑定到 `region=gz` 的单节点，没有跨节点冗余，依赖未来的备份方案覆盖。

## 冒烟

- 冒烟脚本：`scripts/smoke-test.sh`
- 本地 API 快速验证：`scripts/local-api-check.sh`
