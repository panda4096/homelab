# NUC k3s 开发用 PostgreSQL

本文档记录在家里 NUC 的独立 k3s 集群上部署开发调试用 PostgreSQL 的方式。

这套配置只用于开发调试，不作为生产数据源。它与主集群共享数据库配置的差异如下：

- 不使用 `region=gz` 节点选择器，直接运行在 NUC 单节点上。
- 资源较低：request 为 `25m CPU / 96Mi`，limit 为 `250m CPU / 256Mi`。
- PVC 较小：`512Mi`，使用 NUC k3s 默认的 `local-path` StorageClass。
- 不下发主集群共享数据库的限制性 NetworkPolicy，方便 NUC 集群里的调试 Pod 连接。
- 额外提供 `NodePort`，方便家里内网机器直接访问。
- 不预创建任何应用数据库或应用用户；后续应用需要数据库时，由应用自己的初始化流程处理。

## 部署

```bash
# Secret 脚本使用当前 kubectl context，先确保已经切到 nuc。
kubectl config use-context nuc

# 创建 namespace。
kubectl --context nuc apply -f infra/data/postgresql/namespace.yaml

# 只写入 postgres 管理员密码 Secret，不创建应用库和应用用户。
bash infra/data/postgresql/nuc-dev/scripts/apply-admin-secret.sh

# 部署 PostgreSQL、ClusterIP Service 和 NodePort Service。
kubectl --context nuc apply -f infra/data/postgresql/nuc-dev/postgresql.yaml

# 等待 StatefulSet 就绪。
kubectl --context nuc -n data rollout status statefulset/postgresql --timeout=5m
```

## 访问地址

集群内推荐地址：

```text
postgresql.data:5432
```

家里内网直连地址：

```text
192.168.100.29:30432
```

对应的 Kubernetes Service：

```bash
kubectl --context nuc -n data get svc postgresql-nodeport
```

## 数据库和用户策略

NUC 这套开发 PostgreSQL 只提供实例本身，不预创建 `finbrain`、`firefly`、
`ghostfolio` 或其他应用库/应用用户。

默认只有 PostgreSQL 镜像初始化出的 `postgres` 数据库和 `postgres` 管理员用户。
管理员密码来自本地的 `infra/.secrets/postgresql.env` 中的
`POSTGRES_ADMIN_PASSWORD`，不会写入仓库。

后续某个应用需要数据库时，应由该应用自己的部署流程创建对应 database、role、
schema 和权限，不在 NUC PostgreSQL 基础实例里提前耦合。

## NUC DNS 注意事项

NUC 集群里的 Pod 当前会继承额外的 `lan` search suffix。Kubernetes 默认
`ndots:5` 下，非绝对完整域名 `postgresql.data.svc.cluster.local` 会先尝试解析成
`postgresql.data.svc.cluster.local.lan`，这可能被 mihomo fake-ip DNS 接管。

因此集群内连接建议使用：

- `postgresql.data:5432`
- 或带尾点的 `postgresql.data.svc.cluster.local.:5432`

不要在 NUC 集群内使用无尾点的 `postgresql.data.svc.cluster.local`。

## 验证

```bash
kubectl --context nuc -n data get statefulset,pod,svc,pvc -o wide
kubectl --context nuc -n data exec postgresql-0 -- \
  psql -U postgres -tAc "select datname from pg_database where datistemplate = false order by datname;"

# 从家里内网机器验证 NodePort 端口。
nc -vz 192.168.100.29 30432
```

## 卸载

```bash
kubectl --context nuc delete -f infra/data/postgresql/nuc-dev/postgresql.yaml
```

注意：删除 StatefulSet 和 PVC 后，`local-path` 对应的数据目录也会按 PV 的
`Delete` 回收策略清理。开发调试库不要存放唯一数据。
