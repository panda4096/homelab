# apps（业务工作负载层）

本目录预留给部署在集群上的业务应用。

## 建议结构

- 一个应用一个目录，例如 `infra/apps/<app-name>/`
- 每个应用目录至少包含：
  - `README.md`
  - manifest 或 Helm values
  - 部署/回滚说明

## 当前应用

- `infra/apps/firefly/`：Firefly III 账本与信用卡/理财现金流
- `infra/apps/ghostfolio/`：Ghostfolio 证券持仓与收益分析
- `infra/apps/finbrain/`：自研 ingest-agent / review UI / dashboard 部署资产

## 与 `platform/` 的区别

- `infra/platform/`：全局共享的**无状态**基础设施组件（ingress、认证、监控等）。
- `infra/apps/`：面向具体业务或服务的**无状态**工作负载。

## 与 `data/` 的区别

- `infra/apps/` 只放**无状态**的应用工作负载。
- 任何持久化数据后端（数据库、缓存、检索引擎）都进 `infra/data/`，由多个 app 共享，app 侧通过服务 FQDN 连接（例如 `postgresql.data.svc.cluster.local`）。
- app 不再在自己的 namespace 里跑 Postgres StatefulSet / Redis Deployment（Ghostfolio 的 Redis 是过渡例外，后续迁出）。

## 与仓库根目录业务代码的区别

- `infra/apps/` 只放部署到当前 homelab 的 Kubernetes 资产、部署步骤和冒烟脚本。
- 如果某个应用有独立源码、测试、样本数据和产品文档，应在仓库根目录开独立目录维护，再由 `infra/apps/<app-name>/` 引用其镜像或构建产物。
