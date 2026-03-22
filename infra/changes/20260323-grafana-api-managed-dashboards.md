# 变更单：Grafana 自定义 Dashboard 改为 API 托管 + repo 回收（2026-03-23）

- 状态：Done
- 关联文档：`infra/04-监控与Dashboard维护.md`
- 关联目录：`infra/platform/monitoring/grafana/`

## 1. 目的

- 保持系统预设 dashboard 继续由 Helm / chart 管理
- 让自定义 dashboard 不受 Helm provisioning 覆盖
- 支持 Web 微调后由 agent 回收 JSON 到 repo
- 支持 repo 改动再由 agent 推回 Grafana

## 2. repo 变更

- 新文档：`infra/04-监控与Dashboard维护.md`
- dashboard 根目录：`infra/platform/monitoring/grafana/`
- dashboard 清单：`infra/platform/monitoring/grafana/_meta/index.yaml`
- 初始 dashboard：`infra/platform/monitoring/grafana/infra/global-nodes.json`
- API 脚本：
  - `export-dashboard.sh`
  - `export-folder.sh`
  - `apply-dashboard.sh`
  - `apply-folder.sh`

## 3. 执行记录

### 3.1 创建本地 Grafana API 凭据

- 文件：`infra/.secrets/grafana-api.env`
- 策略：
  - `GRAFANA_URL=http://127.0.0.1:3000`
  - `GRAFANA_AUTH_MODE=basic`
  - 首期直接复用 Grafana admin 账号

### 3.2 创建 Grafana Folder 与首张自定义 dashboard

执行：

```bash
kubectl -n monitoring port-forward svc/monitoring-grafana 3000:80
source infra/.secrets/grafana-api.env
bash infra/platform/monitoring/grafana/scripts/apply-folder.sh infra
```

结果：

- 创建 Folder：`Infra`
- 导入 dashboard：`Global Nodes`

### 3.3 回收验证

执行：

```bash
source infra/.secrets/grafana-api.env
bash infra/platform/monitoring/grafana/scripts/export-dashboard.sh infra-global-nodes
```

结果：

- Grafana 中的 dashboard JSON 可成功回收进 repo
- `index.yaml` 会同步 dashboard 的最新标题与 tags

## 4. 验证项

- [x] 自定义 dashboard 不接入 Helm provisioning
- [x] `helm upgrade monitoring` 逻辑未改动
- [x] `Infra` Folder 可通过 API 创建
- [x] `Global Nodes` 可通过 API 导入
- [x] `export-dashboard.sh` 可回收 dashboard JSON
- [x] `apply-dashboard.sh` / `apply-folder.sh` 可推回 Grafana

## 5. 维护约定

- 系统预设 dashboard：继续由 chart 管
- 自定义 dashboard：统一走 `infra/platform/monitoring/grafana/`
- Web 负责交互式设计
- agent 负责导出 / 回收 / 推送 / 规范化
