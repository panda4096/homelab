# network（自动纳管的网络监控）

本目录维护 **网络主动探测** 与 **底层链路指标**，与主监控栈解耦。

## 目录结构

- `phase1-probes/`
  - blackbox exporter
  - VMProbe 自动生成 reconciler
- `phase2-link-metrics/`
  - wireguard exporter
  - kilo metrics scrape
  - network VMRule

## 维护原则

- 不改 `monitoring` 主 Helm values
- 全部通过 `kubectl apply -k` 落地
- 新增节点默认自动纳管
- 自定义 dashboard 仍然通过 Grafana API + repo 回收

## 部署

```bash
export KUBECONFIG="$(pwd)/infra/.secrets/homelab-k3s.yaml"
kubectl apply -k infra/platform/monitoring/network/phase1-probes
kubectl apply -k infra/platform/monitoring/network/phase2-link-metrics
```
