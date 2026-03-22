# 变更单：修复 Grafana 节点 dashboard 的 CPU/内存 `No data`（2026-03-23）

- 状态：Done
- 关联文档：`infra/04-监控平台.md`
- 关联配置：`infra/platform/monitoring/victoria-metrics-k8s-stack/values.yaml`

## 1. 问题

- `Kubernetes / Views / Nodes` 能看到 Pod / 节点总量信息
- 但 `CPU Used`、`RAM Used`、`CPU Usage`、`Memory Usage` 显示 `No data`

## 2. 根因

- 该 dashboard 通过 `node_uname_info` 的 `nodename` 变量反查 `instance`
- 现网 `node_uname_info` 里的：
  - `nodename=monitoring-prometheus-node-exporter-<pod>`
  - `instance=10.42.x.x:9100`
- 即 node-exporter 指标仍按 Pod 名 / PodIP 暴露，未映射到 Kubernetes 节点名

## 3. 变更

- 在 `infra/platform/monitoring/victoria-metrics-k8s-stack/values.yaml` 的 `prometheus-node-exporter.vmScrape.spec` 增加 relabel：
  - `node`
  - `nodename`
  - `instance`
- 三者都从 Kubernetes endpoint / endpointslice 的 node name 填充

## 4. 执行命令

```bash
scp infra/platform/monitoring/victoria-metrics-k8s-stack/values.yaml \
  gz.butcoder.com:/home/ubuntu/monitoring-values.yaml

ssh gz.butcoder.com \
  'KUBECONFIG=/etc/rancher/k3s/k3s.yaml helm upgrade monitoring \
    /home/ubuntu/victoria-metrics-k8s-stack-0.72.5.tgz \
    -n monitoring \
    -f /home/ubuntu/monitoring-values.yaml \
    --wait \
    --timeout 15m'
```

## 5. 验证

- scrape 目标标签：

```bash
kubectl -n monitoring port-forward svc/vmagent-monitoring 8429:8429
curl http://127.0.0.1:8429/api/v1/targets
```

- 结果摘要：
  - `instance=vm-0-11-ubuntu`
  - `nodename=vm-0-11-ubuntu`
  - `node=vm-0-11-ubuntu`
  - `instance=vm-8-11-ubuntu`
  - `nodename=vm-8-11-ubuntu`
  - `node=vm-8-11-ubuntu`

- 时序数据：

```bash
kubectl -n monitoring port-forward svc/vmsingle-monitoring 8428:8428
curl -G 'http://127.0.0.1:8428/prometheus/api/v1/query' \
  --data-urlencode 'query=node_uname_info'
curl -G 'http://127.0.0.1:8428/prometheus/api/v1/query' \
  --data-urlencode 'query=sum(rate(node_cpu_seconds_total{mode!~"idle|iowait|steal",instance="vm-0-11-ubuntu",cluster=~"homelab-k3s"}[5m])) by(cluster)'
curl -G 'http://127.0.0.1:8428/prometheus/api/v1/query' \
  --data-urlencode 'query=sum(node_memory_MemTotal_bytes{instance="vm-0-11-ubuntu",cluster=~"homelab-k3s"} - node_memory_MemAvailable_bytes{instance="vm-0-11-ubuntu",cluster=~"homelab-k3s"}) by(cluster)'
```

- 结果摘要：
  - `node_uname_info` 中 `instance` / `nodename` 已变为节点名
  - `CPU Used` 查询返回非空
  - `RAM Used` 查询返回非空

## 6. 结果

- Grafana `Kubernetes / Views / Nodes` 在刷新变量后应恢复节点 CPU / 内存面板
- 该修复保留在 repo 的 values 中，后续 Helm 升级可重复
