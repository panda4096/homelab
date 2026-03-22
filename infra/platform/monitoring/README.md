# monitoring（平台层组件）

本目录用于维护集群监控栈。

## 当前方案

- 监控栈：`VictoriaMetrics k8s stack`
- 安装方式：Helm（chart 与 values 本地维护）
- 访问策略：`ClusterIP` only，不走公网，不走 Ingress
- 查看方式：`kubectl port-forward`

## 资产位置

- 说明文档：`infra/04-监控平台.md`
- chart：`infra/platform/monitoring/charts/victoria-metrics-k8s-stack-0.72.5.tgz`
- values：`infra/platform/monitoring/victoria-metrics-k8s-stack/values.yaml`
- 版本锁定：`infra/k3s/versions.yaml` 的 `monitoring.*`
- 首次落地变更单：`infra/changes/20260323-monitoring-bootstrap.md`

## 维护约定

- 所有监控相关编排只改 `values.yaml`，不在集群里手工漂移。
- Grafana 管理员密码不入库，只保存在本地私密目录与集群 Secret。
- 第一阶段仅部署 metrics / dashboard / alerting，不部署 blackbox 或跨节点探测。

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
