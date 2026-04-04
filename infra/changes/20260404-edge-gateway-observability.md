# 2026-04-04 edge gateway observability

## 目的

为 `广州入口 -> Kilo -> 新加坡出口` 的代理链路补齐可观测性，能够快速区分：

- 广州公网入口端口异常
- `GZ -> SG` relay / Kilo 路径异常
- 代理协议端到端异常
- 出口 IP 漂移

## 本次变更

### 1. phase1 自动探针扩展

在 `infra/platform/monitoring/network/phase1-probes/reconcile_network_probes.py` 中新增：

- `edge_public_tcp`
  - `106.55.163.135:11080`
  - `106.55.163.135:11081`
  - `106.55.163.135:18388`
  - `106.55.163.135:11800`
- `edge_relay_tcp`
  - `10.4.0.2:11080`
  - `10.4.0.2:11081`
  - `10.4.0.2:18388`

并新增对应告警：

- `HomelabEdgeIngressTcpProbeFailed`
- `HomelabEdgeRelayTcpProbeFailed`

### 2. edge gateway probe exporter

新增目录：

- `infra/platform/monitoring/network/edge-gateway/`

内容包括：

- `edge-gateway.yaml`
- `kustomization.yaml`
- `edge_gateway_probe_exporter.py`

实现方式：

- `DaemonSet`
- `nodeSelector: edge.role=ingress`
- `hostNetwork: true`
- 使用 `busybox + chroot /host /usr/bin/python3`
- 运行时配置来自 `monitoring/edge-gateway-probe-config` Secret

Exporter 暴露指标：

- `edge_gateway_probe_success`
- `edge_gateway_probe_duration_seconds`
- `edge_gateway_probe_http_status_code`
- `edge_gateway_probe_exit_ip_info`
- `edge_gateway_probe_exit_ip_match`

当前探针：

- `direct_generate_204`
- `direct_ip_echo`
- `http_connect_generate_204`
- `http_connect_ip_echo`
- `socks5_generate_204`
- `socks5_ip_echo`

### 3. Grafana dashboard

新增：

- `Infra / Edge Gateway`
- UID: `infra-edge-gateway`

文件：

- `infra/platform/monitoring/grafana/infra/edge-gateway.json`

## 部署命令

```bash
export KUBECONFIG="$(pwd)/infra/.secrets/homelab-k3s.yaml"
bash infra/platform/edge-gateway/scripts/apply-runtime-assets.sh infra/.secrets/edge-gateway-values.yaml
kubectl apply -k infra/platform/monitoring/network/phase1-probes
kubectl apply -k infra/platform/monitoring/network/edge-gateway
kubectl -n monitoring create job --from=cronjob/network-probe-reconciler network-probe-reconciler-manual-<ts>
kubectl -n monitoring rollout status daemonset/edge-gateway-probe-exporter --timeout=300s
```

Grafana 导入：

```bash
kubectl -n monitoring port-forward svc/monitoring-grafana 3000:80
bash infra/platform/monitoring/grafana/scripts/apply-dashboard.sh infra-edge-gateway
```

## 首轮验证结果

资源状态：

- `edge-gateway-probe-exporter`：`Running`
- `edge_public_tcp` / `edge_relay_tcp` VMProbe：`operational`
- `infra-edge-gateway` dashboard：已导入 Grafana

VictoriaMetrics 查询已返回：

- `edge_gateway_probe_success`
- `edge_gateway_probe_duration_seconds`
- `edge_gateway_probe_exit_ip_info`
- `probe_success{probe_scope=~"edge_public_tcp|edge_relay_tcp"}`

首轮人工测量（广州节点本机）：

- `direct generate_204`：`204`，`0.173296s`
- `HTTP CONNECT generate_204`：`204`，`2.099399s`
- `SOCKS5 generate_204`：`204`，`1.707007s`
- `HTTP CONNECT ipify`：出口 `43.156.60.56`，`6.020820s`
- `SOCKS5 ipify`：出口 `43.156.60.56`，`4.016175s`
- `direct ipify`：失败，`curl: (7)`

说明：

- 当前慢点已经不是“公网入口端口不通”或 “Kilo relay 不通”，因为 `edge_public_tcp` 与 `edge_relay_tcp` 都为成功
- 当前更像是：
  - `sg -> 目标站点` 的具体访问质量问题
  - 或代理协议/目标站点组合的真实业务时延问题
  - 而不是单纯的广州入口监听失败
