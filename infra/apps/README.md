# apps（业务工作负载层）

本目录预留给部署在集群上的业务应用。

## 建议结构

- 一个应用一个目录，例如 `infra/apps/<app-name>/`
- 每个应用目录至少包含：
  - `README.md`
  - manifest 或 Helm values
  - 部署/回滚说明

## 与 `platform/` 的区别

- `infra/platform/`：全局共享的基础设施组件。
- `infra/apps/`：面向具体业务或服务的工作负载。
