# 变更单：finbrain Phase 0 基线与应用部署骨架（2026-04-11）

## 目的 / 范围 / 风险

- 目的：
  - 为个人财务系统建立独立产品目录 `finbrain/`
  - 为 `Firefly III`、`Ghostfolio`、`finbrain ingest-agent` 建立独立部署目录
  - 固化统一认证、数据模型、阶段规划和最小服务骨架
- 范围：
  - 仓库目录与文档
  - Kubernetes manifests
  - ingest-agent 最小可运行代码、测试与脚本
- 风险：
  - 中。当前仍是路径前缀模式，`Firefly` / `Ghostfolio` 的子路径兼容性需要上线后验证。

## 变更前检查

- [x] `infra/apps/` 只有占位 README
- [x] 认证基线为 `Traefik + Gateway API + Authelia`
- [x] 仓库中还没有 `finbrain/` 产品目录

## 变更内容

- 新增 `finbrain/`
  - `README.md`
  - `docs/01-06`
  - `ingest-agent/` FastAPI 服务骨架、fixtures、tests、Dockerfile
- 新增 `infra/apps/firefly/`
  - Firefly + Postgres manifests
  - ForwardAuth / NetworkPolicy / scripts
- 新增 `infra/apps/ghostfolio/`
  - Ghostfolio + Postgres + Redis manifests
  - ForwardAuth / NetworkPolicy / scripts
- 新增 `infra/apps/finbrain/`
  - finbrain + Postgres manifests
  - ForwardAuth / NetworkPolicy / backup CronJob / scripts
- 更新：
  - `infra/apps/README.md`
  - `infra/README.md`

## 执行命令

本次仅进行了 repo 内文件变更，未对线上集群执行 `kubectl apply`。

## 验证项

- [x] `finbrain/` 目录存在
- [x] `infra/apps/firefly/` 存在
- [x] `infra/apps/ghostfolio/` 存在
- [x] `infra/apps/finbrain/` 存在
- [x] `finbrain/ingest-agent/` 含最小测试和 Dockerfile

## 后续

- Phase 1：优先上线 Firefly III 与账单导入
- Phase 2：上线 Ghostfolio 与双券商账户基线
- Phase 3：逐步接入 HSBC PDF / Futu CSV / 理财产品
