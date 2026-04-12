# 变更单：finbrain 硬化 + 共享数据层迁移（2026-04-11）

## 目的 / 范围 / 风险

- 目的：
  - 对 Opus 4.6 评审指出的 finbrain Phase 0 骨架 4 个硬问题 + 3 个基本认同项做一次集中硬化
  - 把三个 app 内部独立维护的 Postgres StatefulSet 剥离出来，建立新的 `infra/data/` 顶级目录
  - 用 bitnami 官方 `postgresql` chart 部署一份共享 PostgreSQL 实例，三个 database 三个用户
  - 锁定 finbrain 原始凭证（HSBC PDF / Futu CSV）的存储接入点
- 范围：
  - 新建 `infra/data/postgresql/` 共享数据层
  - finbrain / firefly / ghostfolio 三个 app 删除各自的 `postgres-statefulset.yaml` / `postgres-service.yaml`，重布线到共享 PG
  - 集群凭据从 ConfigMap 剥离到 Secret（finbrain `FINBRAIN_DATABASE_URL` 核心问题）
  - 为每个 app 增加 `scripts/apply-secrets.sh`，从 `infra/.secrets/*.env` 源文件生成集群 Secret
  - finbrain uploads PVC + `ActivityRecord.raw_doc_uri` 字段 + `ActivityRecord.wealth_product_code` 字段
  - `ingest_activities` 重构为单事务 batch commit，加一个 mid-batch rollback 的测试
  - `dashboard_snapshot` 加 Phase 0 占位实现的 docstring
  - 文档收口：`infra/README.md` / `infra/apps/README.md` / `infra/.secrets/README.md` / `finbrain/docs/02` / `finbrain/docs/06`
- 风险：
  - **中**。bitnami/postgresql chart 的默认镜像仍来自 `docker.io/bitnami/postgresql`；Broadcom 收购后新镜像可能需要 registry override，vendoring 时同步验证。
  - `helm upgrade --install postgresql ... -n data` 是首次创建，顺序依赖强：必须先 apply namespace，再运行 `apply-secrets.sh`（admin + init-scripts），最后 helm install；init 脚本只在 chart 首次启动时执行一次。
  - 三个 app 重新 apply 之前必须确认共享 PG 上的三个 database + 三个 user 已经就绪，否则 deployment 会在 readinessProbe 阶段 fail。
  - `ingest_activities` 的批量事务语义从"前 N 条进库 + 错误"变为"整批回滚"；HSBC PDF / Futu CSV 的导入脚本未来需要准备重试能力。
  - 三个 app 内的 `postgres-statefulset.yaml` / `postgres-service.yaml` 在提交本次变更前属于 untracked 文件，删除操作不影响任何已落库的历史。`infra/changes/20260411-finbrain-phase0-bootstrap.md` 明确本次 bootstrap "未对线上集群执行 kubectl apply"。

## 变更前检查

- [x] finbrain Phase 0 骨架尚未 apply 到集群（见 `20260411-finbrain-phase0-bootstrap.md`）
- [x] `infra/data/` 目录不存在
- [x] `helm version` 可用，bitnami 仓库可添加（`charts.bitnami.com/bitnami`）
- [x] `infra/platform/traefik/charts/traefik-39.0.7.tgz` 和 `infra/platform/authelia/charts/authelia-0.10.50.tgz` 已有的 vendored chart 模式已成型

## 变更内容

### 新增：infra/data/ 共享数据层

- `infra/data/README.md`
- `infra/data/postgresql/README.md`
- `infra/data/postgresql/namespace.yaml`（namespace `data`）
- `infra/data/postgresql/values.yaml`（bitnami/postgresql values，1Gi PVC，`region=gz` 节点亲和，metrics / volumePermissions 关，readReplicas=0，backup 关）
- `infra/data/postgresql/charts/postgresql-16.7.27.tgz`（vendored bitnami chart，appVersion 17.6.0）
- `infra/data/postgresql/networkpolicy.yaml`（只允许 `firefly` / `ghostfolio` / `finbrain` 三个 namespace 访问 5432）
- `infra/data/postgresql/init-scripts/01-create-app-databases.sql`（创建三个 database 和三个 user，REVOKE FROM PUBLIC）
- `infra/data/postgresql/scripts/apply-secrets.sh`（生成 `postgresql-admin` 和 `postgresql-init-scripts`，Python 做占位符替换）
- `infra/data/postgresql/scripts/helm-install.sh`（`helm upgrade --install` 薄封装）
- `infra/.secrets/postgresql.env`（admin 密码 + 三个 app 用户的初始密码）

### 新增：三个 app 的 secrets 脚本和源文件

- `infra/apps/firefly/scripts/apply-secrets.sh` / `infra/.secrets/firefly.env`
- `infra/apps/ghostfolio/scripts/apply-secrets.sh` / `infra/.secrets/ghostfolio.env`
- `infra/apps/finbrain/scripts/apply-secrets.sh` / `infra/.secrets/finbrain.env`

三个脚本都 source `postgresql.env` 拿 DB 密码，source 各自 `<app>.env` 拿非数据库密钥，组装并 `kubectl create secret generic --dry-run=client -o yaml | kubectl apply -f -` 幂等落地。

### 新增：finbrain 原始凭证接入点

- `infra/apps/finbrain/finbrain-uploads-pvc.yaml`（`local-path`, 1Gi, `ReadWriteOnce`，name `finbrain-uploads`）
- `finbrain-deployment.yaml` 加 volume + volumeMount 到 `/var/finbrain/uploads`
- `finbrain-configmap.yaml` 加 `FINBRAIN_UPLOADS_DIR: /var/finbrain/uploads`
- `finbrain/ingest-agent/app/config.py` 加 `uploads_dir: str = "./uploads"` 默认值
- `finbrain/ingest-agent/app/models.py` 的 `ActivityRecord` 加 nullable 字段 `raw_doc_uri`、`wealth_product_code`
- `finbrain/ingest-agent/app/schemas.py` 的 `ActivityCreate` / `ActivityRead` 同步加两个字段
- `finbrain/ingest-agent/app/repository.py` 的 `ingest_activities` 构造 `ActivityRecord` 时透传两个字段
- `finbrain/ingest-agent/app/main.py` 的 `/api/v1/reviews` 响应序列化带上两个字段
- `finbrain/docs/02-数据模型与统一ActivitySchema.md` 增加字段说明和产品关联约定
- `finbrain/docs/06-备份恢复与审计.md` 重写：备份范围覆盖三类资产；明确当前 backup CronJob 的 S3 是占位，Phase 1 前必须单独一单决策真正的备份方案

### 新增：变更单和变更记录文档

- `infra/changes/20260411-finbrain-hardening-and-data-layer.md`（本文件）

### 删除：三份 per-app Postgres

- `infra/apps/finbrain/postgres-statefulset.yaml`
- `infra/apps/finbrain/postgres-service.yaml`
- `infra/apps/firefly/postgres-statefulset.yaml`
- `infra/apps/firefly/postgres-service.yaml`
- `infra/apps/ghostfolio/postgres-statefulset.yaml`
- `infra/apps/ghostfolio/postgres-service.yaml`

### 修改

- `infra/README.md` — 加 `infra/data/postgresql/` 的资产清单入口，目录职责约定里新增 "`infra/data/` 数据层，放共享的有状态后端"
- `infra/apps/README.md` — 新增 "与 data 的区别" 小节
- `infra/.secrets/README.md` — 新增"数据层 PostgreSQL 与业务应用密码"小节，对齐 Authelia 的写法
- `infra/apps/finbrain/finbrain-configmap.yaml` — 删除 `FINBRAIN_DATABASE_URL`（**本次核心**），新增 `FINBRAIN_UPLOADS_DIR`
- `infra/apps/finbrain/finbrain-deployment.yaml` — 加 uploads 挂载
- `infra/apps/finbrain/kustomization.yaml` — 移除 `postgres-*`，加入 `finbrain-uploads-pvc.yaml`
- `infra/apps/finbrain/secrets.example.yaml` — 重构为说明 template，标注 `apply-secrets.sh` 是真实流程
- `infra/apps/finbrain/README.md` — 重写部署前置和首次部署步骤
- `infra/apps/finbrain/finbrain-db-backup-cronjob.yaml` — `suspend: true`；`pg_dump -h` 改为 `postgresql.data.svc.cluster.local`；加 annotations 说明待改造
- `infra/apps/firefly/firefly-configmap.yaml` — `DB_HOST: postgresql.data.svc.cluster.local`
- `infra/apps/firefly/firefly-deployment.yaml` — Secret 引用从 `firefly-postgres-secrets` 改为 `firefly-db-credentials`
- `infra/apps/firefly/kustomization.yaml` — 移除 `postgres-*`
- `infra/apps/firefly/secrets.example.yaml` — rename 为 `firefly-db-credentials`
- `infra/apps/firefly/README.md` — 重写部署前置
- `infra/apps/ghostfolio/ghostfolio-configmap.yaml` — 删除 `POSTGRES_DB`
- `infra/apps/ghostfolio/ghostfolio-deployment.yaml` — Secret 引用改名；删除 `POSTGRES_USER` / `POSTGRES_PASSWORD` env（Ghostfolio 只读 `DATABASE_URL`）
- `infra/apps/ghostfolio/kustomization.yaml` — 移除 `postgres-*`
- `infra/apps/ghostfolio/secrets.example.yaml` — rename 为 `ghostfolio-db-credentials`，`database-url` 指向共享 PG
- `infra/apps/ghostfolio/README.md` — 重写部署前置
- `finbrain/ingest-agent/app/repository.py` — `ingest_activities` 重构为单事务 batch commit；`dashboard_snapshot` 加 Phase 0 占位 docstring；字段透传
- `finbrain/ingest-agent/app/models.py` — `ActivityRecord` 加两个 nullable 字段
- `finbrain/ingest-agent/app/schemas.py` — `ActivityCreate` / `ActivityRead` 加两个字段
- `finbrain/ingest-agent/app/main.py` — reviews 响应序列化带上两个字段
- `finbrain/ingest-agent/app/config.py` — 加 `uploads_dir`
- `finbrain/ingest-agent/tests/test_ingest.py` — 原 idempotency 用例不变；新增 `test_ingest_batch_rolls_back_all_on_mid_batch_failure`

## 不在本次范围（显式）

- 共享 PG + uploads 的真正备份方案落地（外部 S3 / 两节点同步二选一）。现有 CronJob 已 suspend。
- Redis / Elasticsearch 迁入 `infra/data/`（Ghostfolio 的 Redis 仍留在 apps 目录下）
- 公网 IP → 域名 + ACME 证书迁移
- `dashboard_snapshot` 的真实聚合逻辑
- HSBC PDF 上传 endpoint 的 FastAPI 路由（本次只铺 PVC + 字段 + 配置项）
- dispatchers HTTP 客户端化和测试
- 原 Opus 基本 7（config 拒绝 SQLite）：被 DB 重构结构性消除，drop

## 执行命令

本次**仍未**对线上集群执行 `kubectl apply` / `helm upgrade`。仓库内完成所有文件变更 + 测试。集群侧变更在合并后按下列顺序手工执行（首次部署 runbook）：

```bash
# === 数据层 ===
kubectl apply -f infra/data/postgresql/namespace.yaml
# 先把 infra/.secrets/postgresql.env 填上真值
bash infra/data/postgresql/scripts/apply-secrets.sh
bash infra/data/postgresql/scripts/helm-install.sh
kubectl -n data rollout status statefulset/postgresql
kubectl apply -f infra/data/postgresql/networkpolicy.yaml
kubectl -n data exec postgresql-0 -- psql -U postgres -c '\l'
kubectl -n data exec postgresql-0 -- psql -U postgres -c '\du'

# === Apps ===
for app in firefly ghostfolio finbrain; do
  kubectl apply -f infra/apps/$app/namespace.yaml
  # 先把 infra/.secrets/$app.env 填上真值
  bash infra/apps/$app/scripts/apply-secrets.sh
  kubectl apply -k infra/apps/$app
  kubectl -n $app rollout status deploy/$app
done

# === 连通性 ===
kubectl -n finbrain exec deploy/finbrain -- \
  python -c "import psycopg, os; psycopg.connect(os.environ['FINBRAIN_DATABASE_URL']).close(); print('ok')"
```

## 验证项（仓库内）

- [x] `kubectl kustomize infra/apps/finbrain` 成功，`kind: StatefulSet` 数量为 0
- [x] `kubectl kustomize infra/apps/firefly` 成功，`kind: StatefulSet` 数量为 0
- [x] `kubectl kustomize infra/apps/ghostfolio` 成功，`kind: StatefulSet` 数量为 0
- [x] `grep -c FINBRAIN_DATABASE_URL <(kubectl kustomize infra/apps/finbrain)` 为 0（ConfigMap 不再含）
- [x] `grep PersistentVolumeClaim <(kubectl kustomize infra/apps/finbrain)` 命中 `finbrain-uploads`
- [x] `finbrain/ingest-agent`: `pytest -q` 5 个用例全绿（含新增 rollback 用例）

## 验证项（集群侧，待执行）

- [ ] `kubectl -n data exec postgresql-0 -- psql -U postgres -c '\l'` 列出 firefly / ghostfolio / finbrain 三个 database
- [ ] `kubectl -n data get netpol` 显示 `postgresql-from-apps-only`
- [ ] `kubectl -n finbrain exec deploy/finbrain -- printenv FINBRAIN_DATABASE_URL` 以 `@postgresql.data.svc.cluster.local:5432/finbrain` 结尾
- [ ] `kubectl -n finbrain get cm finbrain-config -o jsonpath='{.data.FINBRAIN_DATABASE_URL}'` 为空
- [ ] `kubectl -n finbrain get pvc finbrain-uploads` Bound
- [ ] `kubectl -n finbrain exec deploy/finbrain -- ls -ld /var/finbrain/uploads` 可写
- [ ] finbrain / firefly / ghostfolio readinessProbe 就绪
- [ ] 从非三个 app namespace 的 debug pod `nc -zv postgresql.data.svc.cluster.local 5432` 超时（NetworkPolicy 生效）

## 后续

- 新开单 `data-layer-backup`：决策并落地真正的 pg + uploads 备份方案，解除 `finbrain-db-backup-cronjob.yaml` 的 `suspend: true` 或直接重写
- 新开单 `infra-data-redis`：把 Ghostfolio 的 Redis 迁出 apps 目录到 `infra/data/redis/`
- 新开单 `public-ingress-domain`：接入真实域名 + ACME 证书，解决路径前缀 + IP 入口的 WebAuthn 问题
- Phase 1 继续：Firefly III 账户初始化 + 信用卡账单导入
