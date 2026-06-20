# PostgreSQL（共享数据库）

homelab 共享 PostgreSQL,供 `firefly` / `ghostfolio` / `finbrain` 使用。用**一个本地 Helm chart**
封装(官方 `postgres:17-alpine`,纯 manifest,非 bitnami——bitnami 镜像墙内拉不到),**多环境共用、
差异走 values**,改共享配置只改一处,云端(gz)和 NUC 不再各维护一份。

## 资产清单

- chart:`chart/`(Service / StatefulSet / 可选 NodePort / 可选 NetworkPolicy)
- 共享基础值:`chart/values.yaml`(image、调优 args、resources、探针…)
- 环境覆盖:`values-gz.yaml`(云端主集群)/ `values-nuc-dev.yaml`(家里 NUC)
- namespace:`namespace.yaml`(`data`;不由 chart 管)
- init 脚本模板:`init-scripts/01-create-app-databases.sql`
- Secret 脚本:`scripts/apply-secrets.sh`(主集群,建 admin+init 两个 Secret)/ `nuc-dev/scripts/apply-admin-secret.sh`(NUC,只建 admin)
- 安装脚本:`scripts/helm-install.sh`(= helm upgrade --install + values-gz)
- 密码源:`infra/.secrets/postgresql.env`

## 环境差异(由 values 覆盖)

| | 云端 `values-gz.yaml` | NUC `values-nuc-dev.yaml` |
|---|---|---|
| nodeSelector | `region: gz` | 无(单节点) |
| PVC | 1Gi | 512Mi |
| NodePort | 关 | 开(`30432`,内网直连) |
| 限制性 NetworkPolicy | 开(只放行三 app ns) | 关(方便调试) |
| init 建库/用户 | 开(建 finbrain/firefly/ghostfolio) | 关(应用自理) |
| 调优 args / image / resources / 探针 | ← 都在 `chart/values.yaml`,两边一致 | ← 同 |

> StatefulSet 的 `volumeClaimTemplate` 不可改:各环境 `persistence.size` 必须与现存 PVC 一致。

## 连接

集群内 FQDN:`postgresql.data.svc.cluster.local:5432`

| 应用 | user | database |
|---|---|---|
| Firefly III | `firefly` | `firefly` |
| Ghostfolio | `ghostfolio` | `ghostfolio` |
| finbrain | `finbrain` | `finbrain` |

## 部署

```bash
# 云端(主集群):
kubectl config use-context homelab-default
kubectl apply -f infra/data/postgresql/namespace.yaml
bash infra/data/postgresql/scripts/apply-secrets.sh          # admin + init Secret
bash infra/data/postgresql/scripts/helm-install.sh           # helm + values-gz
kubectl -n data exec postgresql-0 -- psql -U postgres -c '\l'   # 验证三个库/用户

# NUC:
kubectl config use-context nuc
kubectl --context nuc apply -f infra/data/postgresql/namespace.yaml
bash infra/data/postgresql/nuc-dev/scripts/apply-admin-secret.sh
helm --kube-context nuc upgrade --install postgresql infra/data/postgresql/chart \
  -n data -f infra/data/postgresql/values-nuc-dev.yaml
```

> 接管「已有的裸 kubectl apply 资源」时,Helm 4 的 server-side-apply 会和旧的
> kubectl-client-side-apply 字段管理冲突。因 PVC retentionPolicy=Retain,先删 StatefulSet/Service
> (数据保留在 PVC)再 `helm install` 即可,见 `scripts/helm-install.sh` 注释。

## 密码

`infra/.secrets/postgresql.env` 是唯一真值源(`POSTGRES_ADMIN_PASSWORD` + 三个 `*_DB_PASSWORD`)。
`apply-secrets.sh` 据此展开 `init-scripts/01-create-app-databases.sql` 生成 `postgresql-admin`
和 `postgresql-init-scripts` 两个 Secret(chart 不管 Secret,引用其名)。

init 脚本只在**首次启动**(空数据目录)执行一次;之后轮换密码要在运行中的 PG 上手动
`ALTER USER ... PASSWORD` 再同步 `postgresql.env` 与对应 Secret。

## 存储 / 备份

- StorageClass `local-path`;扩容 `kubectl -n data edit pvc data-postgresql-0`(local-path 支持在线 resize)。
- 备份本单不处理;pg + finbrain 头像(存 DB)的落地备份方案后续单独一单。
