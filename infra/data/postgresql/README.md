# PostgreSQL（共享数据库）

当前 homelab 的共享 PostgreSQL 实例，供 `firefly` / `ghostfolio` / `finbrain` 三个应用使用。

## 资产清单

- chart 锁定版本：`charts/postgresql-16.7.27.tgz`（bitnami/postgresql，appVersion `17.6.0`）
- values：`values.yaml`
- namespace：`namespace.yaml`（namespace `data`）
- NetworkPolicy：`networkpolicy.yaml`（只允许 `firefly` / `ghostfolio` / `finbrain` 三个 namespace 访问 5432）
- init 脚本模板：`init-scripts/01-create-app-databases.sql`
- 应用 Secret 脚本：`scripts/apply-secrets.sh`
- helm 安装脚本：`scripts/helm-install.sh`
- 密码源：`infra/.secrets/postgresql.env`

## 默认连接地址

集群内 FQDN：`postgresql.data.svc.cluster.local:5432`

三个应用各自的连接：

| 应用 | user | database | 备注 |
|---|---|---|---|
| Firefly III | `firefly` | `firefly` | `DB_CONNECTION=pgsql` |
| Ghostfolio | `ghostfolio` | `ghostfolio` | `DATABASE_URL` 直连，带 `?schema=public` |
| finbrain | `finbrain` | `finbrain` | `FINBRAIN_DATABASE_URL` 用 `postgresql+psycopg://` scheme |

## 首次部署

按顺序执行：

```bash
# 1. 创建 namespace
kubectl apply -f infra/data/postgresql/namespace.yaml

# 2. 准备 Secret（admin 密码 + 三个 app 用户初始密码）
#    先确保 infra/.secrets/postgresql.env 已经写好
bash infra/data/postgresql/scripts/apply-secrets.sh

# 3. 安装 chart
bash infra/data/postgresql/scripts/helm-install.sh

# 4. 等待就绪
kubectl -n data rollout status statefulset/postgresql

# 5. apply NetworkPolicy
kubectl apply -f infra/data/postgresql/networkpolicy.yaml

# 6. 验证三个 database 和三个 user 都已经被 init 脚本创建
kubectl -n data exec postgresql-0 -- psql -U postgres -c '\l'
kubectl -n data exec postgresql-0 -- psql -U postgres -c '\du'
```

## 密码来源

`infra/.secrets/postgresql.env` 是唯一真值源，包含四个变量：

```
POSTGRES_ADMIN_PASSWORD=...   # 对应 Secret postgresql-admin 的 postgres-password 键
FIREFLY_DB_PASSWORD=...       # firefly 用户的初始密码
GHOSTFOLIO_DB_PASSWORD=...    # ghostfolio 用户的初始密码
FINBRAIN_DB_PASSWORD=...      # finbrain 用户的初始密码
```

`scripts/apply-secrets.sh` 会读取这份文件，展开 `init-scripts/01-create-app-databases.sql` 中的占位符，并生成两个 Secret：

- `postgresql-admin`
- `postgresql-init-scripts`

同一份 `postgresql.env` 也被三个 app 目录下的 `scripts/apply-secrets.sh` 读取，用于组装各自的 `DATABASE_URL`（参见 `infra/apps/<app>/scripts/apply-secrets.sh`）。

## 密码轮换

init 脚本只在**首次启动**被 bitnami chart 执行一次。此后轮换用户密码必须在运行中的 Postgres 上手动 `ALTER USER`：

```bash
kubectl -n data exec -it postgresql-0 -- \
  psql -U postgres -c "ALTER USER finbrain WITH PASSWORD '<new>';"
```

然后更新 `infra/.secrets/postgresql.env` 和对应 app 的 Secret。

## 存储

- StorageClass：`local-path`
- 初始容量：`1Gi`（homelab 资源紧张下的保守起步；三个 app 初期数据量均在 MB 量级）
- 节点亲和：`nodeSelector: region=gz`（和原 per-app postgres StatefulSet 一致）
- 扩容：`kubectl -n data edit pvc data-postgresql-0`（local-path provisioner 支持在线 resize）

## 备份

**本次 update 不处理备份。** 现有 `infra/apps/finbrain/finbrain-db-backup-cronjob.yaml` 的外部 S3 字段是 agent 生成的占位，实际未启用；pg + finbrain uploads 的可落地备份方案会在后续单独一单解决（两节点内部同步 / 外部对象存储二选一）。

## 镜像

chart 16.7.27 默认镜像：`docker.io/bitnami/postgresql:17.6.0-debian-12-r4`。

Broadcom 收购 bitnami 后部分非 legacy 镜像已移到 `registry.bitnami.com`。如果拉取 `docker.io/bitnami/postgresql` 失败，在 `values.yaml` 顶部追加：

```yaml
image:
  registry: docker.io
  repository: bitnamilegacy/postgresql
  tag: 17.6.0-debian-12-r4
```

或使用官方 `postgres:17-alpine` + 校验 bitnami chart 的 init 兼容性（需要测试 `initdb.scriptsSecret` 的执行路径，非官方 bitnami 镜像未必挂得进去）。

## 与 `infra/apps/` 的契约

三个 app 不再在自己的 namespace 里跑 postgres，对应的 `postgres-statefulset.yaml` / `postgres-service.yaml` 已经被删除。它们连接共享 PG 时：

- 连接字符串的 host 部分必须是 `postgresql.data.svc.cluster.local`
- 连接使用的 user 必须是本应用名字对应的 user（最小权限，不允许跨 database 访问）
- 如果 app 需要新的 database 或新的 user，**修改 `init-scripts/01-create-app-databases.sql` 并在线手工 `CREATE DATABASE / CREATE USER`**，然后把变更记录进变更单；init 脚本本身不会在已初始化的 pg 上重跑。
