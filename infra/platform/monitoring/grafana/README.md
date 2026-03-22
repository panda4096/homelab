# grafana（自定义 dashboard 托管）

本目录只维护 **自定义 dashboard**。

## 分工边界

- 系统预设 dashboard
  - 来源：`victoria-metrics-k8s-stack` chart
  - 维护方式：Helm / chart
- 自定义 dashboard
  - 来源：Grafana Web 或 agent 生成
  - 维护方式：Grafana HTTP API + repo 回收

## 目录结构

- `_meta/index.yaml`
  - dashboard / folder 清单
- `infra/`
  - 基础设施 dashboard
- `apps/`
  - 业务 dashboard
- `scripts/`
  - 导入 / 导出脚本

## 当前 folder

- `Infra`
- `Apps`

## 当前 dashboard

- `Infra / Global Nodes`
  - UID：`infra-global-nodes`
  - 文件：`infra/platform/monitoring/grafana/infra/global-nodes.json`

## 日常维护流程

### Web 调完，回收 repo

```bash
kubectl -n monitoring port-forward svc/monitoring-grafana 3000:80
source infra/.secrets/grafana-api.env
bash infra/platform/monitoring/grafana/scripts/export-dashboard.sh infra-global-nodes
```

### repo 改完，推回 Grafana

```bash
kubectl -n monitoring port-forward svc/monitoring-grafana 3000:80
source infra/.secrets/grafana-api.env
bash infra/platform/monitoring/grafana/scripts/apply-dashboard.sh infra-global-nodes
```

### 整个 folder 批量同步

```bash
source infra/.secrets/grafana-api.env
bash infra/platform/monitoring/grafana/scripts/export-folder.sh infra
bash infra/platform/monitoring/grafana/scripts/apply-folder.sh infra
```

## 约定

- 自定义 dashboard 一律打 tag：`managed-by-repo`
- dashboard 的稳定标识是 `uid`
- folder 归属来自 `_meta/index.yaml`
- 不直接把自定义 dashboard 挂进 Helm / sidecar provisioning
