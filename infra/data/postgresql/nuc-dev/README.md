# NUC k3s 开发用 PostgreSQL

本文档记录在家里 NUC 的独立 k3s 集群上部署开发调试用 PostgreSQL 的方式。

本环境与云端**共用 `../chart`**,差异只在 `../values-nuc-dev.yaml`:

- 无 `region=gz` 节点选择器(NUC 单节点)。
- PVC `512Mi`(云端 1Gi);StorageClass `local-path`。
- 额外 `NodePort`(30432),方便家里内网直连。
- 不下发限制性 NetworkPolicy,方便 NUC 内调试 Pod 连接。
- 不预创建应用库/用户(init 关);应用自理。
- image / 调优 args / resources / 探针等共享配置在 `../chart/values.yaml`,与云端一致(改一处两边生效)。

## 部署

```bash
# Secret 脚本使用当前 kubectl context，先确保已经切到 nuc。
kubectl config use-context nuc

# 创建 namespace。
kubectl --context nuc apply -f infra/data/postgresql/namespace.yaml

# 只写入 postgres 管理员密码 Secret，不创建应用库和应用用户。
bash infra/data/postgresql/nuc-dev/scripts/apply-admin-secret.sh

# 部署 PostgreSQL(ClusterIP + NodePort Service):共享 chart + NUC 覆盖值。
helm --kube-context nuc upgrade --install postgresql infra/data/postgresql/chart \
  -n data -f infra/data/postgresql/values-nuc-dev.yaml

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
helm --kube-context nuc -n data uninstall postgresql
# PVC retentionPolicy=Retain,卸载后数据仍保留;要彻底清数据再手动删 PVC:
# kubectl --context nuc -n data delete pvc data-postgresql-0
```

注意：删除 PVC 后,`local-path` 对应的数据目录也会按 PV 回收策略清理。开发调试库不要存放唯一数据。
