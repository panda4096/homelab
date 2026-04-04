# monitoring（平台层组件）

本目录用于维护集群监控栈。

## 当前方案

- 监控栈：`VictoriaMetrics k8s stack`
- 安装方式：Helm（chart 与 values 本地维护）
- 访问策略：`ClusterIP` only，不走公网，不走 Ingress
- 查看方式：`kubectl port-forward`
- dashboard 维护：系统预设继续由 Helm 管；自定义 dashboard 改为 Grafana API + repo 回收

## 资产位置

- 说明文档：`infra/04-监控与Dashboard维护.md`
- 网络监控文档：`infra/05-网络探测与链路监控.md`
- chart：`infra/platform/monitoring/charts/victoria-metrics-k8s-stack-0.72.5.tgz`
- values：`infra/platform/monitoring/victoria-metrics-k8s-stack/values.yaml`
- dashboard 管理：`infra/platform/monitoring/grafana/README.md`
- network manifests：`infra/platform/monitoring/network/README.md`
- edge gateway observability：`infra/platform/monitoring/network/edge-gateway/`
- 版本锁定：`infra/k3s/versions.yaml` 的 `monitoring.*`
- 首次落地变更单：`infra/changes/20260323-monitoring-bootstrap.md`

## 维护约定

- 所有监控相关编排只改 `values.yaml`，不在集群里手工漂移。
- Grafana 管理员密码不入库，只保存在本地私密目录与集群 Secret。
- 网络探测与底层链路指标独立到 `infra/platform/monitoring/network/`，不并入主 Helm values。
- 自定义 dashboard 不进入 Helm provisioning；统一通过 Grafana API 脚本导入导出。

## 执行方式

- 同步 chart / values 到 `gz`
- 在 `gz` 执行 Helm：
  - `helm upgrade --install monitoring /home/ubuntu/victoria-metrics-k8s-stack-0.72.5.tgz -n monitoring -f /home/ubuntu/monitoring-values.yaml --create-namespace --wait`
- Grafana 访问：
  - `kubectl -n monitoring port-forward svc/monitoring-grafana 3000:80`
- VictoriaMetrics 查询：
  - `kubectl -n monitoring port-forward svc/vmsingle-monitoring 8428:8428`

## 本次落地结果

- release：`monitoring`
- chart：`victoria-metrics-k8s-stack 0.72.5`
- 状态：`helm status monitoring -n monitoring` 为 `deployed`
- 暴露方式：所有服务保持 `ClusterIP`
