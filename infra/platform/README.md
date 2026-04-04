# platform（集群就绪后的平台层）

本目录用于维护 **k3s 集群已经可用之后** 才部署的公共基础设施。

## 职责边界

- `infra/k3s/`：负责把集群拉起并保持可恢复。
- `infra/platform/`：负责集群上的公共组件，例如 ingress、监控、日志、证书管理。
- `infra/apps/`：负责业务应用与环境级编排。

## 当前组件

- traefik：`infra/platform/traefik/`
- authelia：`infra/platform/authelia/`
- portal：`infra/platform/portal/`
- edge gateway：`infra/platform/edge-gateway/`
- monitoring：`infra/platform/monitoring/`
- network monitoring：`infra/platform/monitoring/network/`

公网 Web 服务默认接入方式见：

- `infra/07-公网访问与统一认证链路.md`

## 维护约定

- 每个组件一个独立子目录，至少包含 `README.md`、`values.yaml` 或 manifest。
- Helm 组件建议同时保存 values 文件、锁定版本、vendored chart 包。
- 任何变更都先改 repo，再执行 `helm upgrade` / `kubectl apply`，并补变更单。
