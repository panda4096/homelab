# 变更单：网络监控改为自动纳管（2026-03-23）

- 状态：Done
- 关联文档：`infra/05-网络探测与链路监控.md`
- 关联目录：`infra/platform/monitoring/network/`

## 1. 目的

- 为 homelab 增加主动探测与底层网络指标
- 让新增节点默认纳管，不再手工补 probe matrix
- 将网络监控与主监控 Helm release 解耦

## 2. repo 变更

- 新文档：`infra/05-网络探测与链路监控.md`
- 新目录：`infra/platform/monitoring/network/`
- 新 dashboard：
  - `infra/platform/monitoring/grafana/infra/inter-node-network.json`
  - `infra/platform/monitoring/grafana/infra/endpoint-reachability.json`
  - `infra/platform/monitoring/grafana/infra/wireguard-underlay.json`
  - `infra/platform/monitoring/grafana/infra/node-network-health.json`

## 3. 执行记录

### 3.1 部署 phase1

- 关键命令：
  - `kubectl annotate node vm-8-11-ubuntu homelab.panda/public-endpoint=gz.butcoder.com homelab.panda/apiserver-endpoint=true --overwrite`
  - `kubectl annotate node vm-0-11-ubuntu homelab.panda/public-endpoint=sg.butcoder.com --overwrite`
  - `kubectl apply -k infra/platform/monitoring/network/phase1-probes`
- 落地结果：
  - `network-blackbox-exporter` 以 `DaemonSet` 方式运行在全部 Linux 节点
  - `network-probe-reconciler` 以 `CronJob` 方式自动生成/更新 `VMProbe`
  - 当前 `VMProbe` 数量为 `20`
  - 结构：`internal=4`、`public_http=4`、`public_https=4`、`icmp=4`、`apiserver=2`、`clusterip=2`

### 3.2 部署 phase2

- 关键命令：
  - `kubectl apply -k infra/platform/monitoring/network/phase2-link-metrics`
  - `kubectl -n monitoring rollout status ds/network-wireguard-exporter --timeout=180s`
- 实际修正：
  - 初版 `network-wireguard-exporter` 运行用户为镜像默认用户 `uid=1000`，`wg show all dump` 返回 `Operation not permitted`
  - 已将 `wireguard-exporter` 改为 `runAsUser: 0` / `privileged: true`
  - 追加 `kilo-metrics` `VMPodScrape`，直接抓取 `kube-system/kilo` 的 `1107` metrics
- 落地结果：
  - `network-wireguard-exporter` `DaemonSet` 两节点 `Ready`
  - `network-blackbox-exporter`、`network-wireguard-exporter`、`kilo-metrics` 三个采集对象均处于 `operational`
  - `network-link-rules` 已加载 `WireGuard` / `Kilo` / `softnet` / `TCP retransmits` / `conntrack` 告警规则

### 3.3 验证

- 组件状态：
  - `kubectl -n monitoring get ds network-blackbox-exporter network-wireguard-exporter -o wide`
    - `network-blackbox-exporter 2/2 Ready`
    - `network-wireguard-exporter 2/2 Ready`
  - `kubectl -n monitoring get cronjob network-probe-reconciler`
    - `schedule=*/5 * * * *`
  - `kubectl -n monitoring get vmpodscrape network-blackbox-exporter network-wireguard-exporter kilo-metrics`
    - 全部 `operational`
- 指标验证：
  - `count(probe_success)=20`
  - `count(wireguard_latest_handshake_seconds)=2`
  - `max(kilo_nodes)=2`
  - `count(node_softnet_dropped_total)=6`
  - `count(node_nf_conntrack_entries)=2`
- 自动纳管验证：
  - 对 `vm-0-11-ubuntu` 临时加 label `homelab.panda/network-monitor=disabled`
  - 手工触发 `network-probe-reconciler` 后，`VMProbe` 从 `20` 降到 `6`
  - 删除该 label 并再次触发后，`VMProbe` 恢复到 `20`
- Dashboard：
  - 已导入：
    - `Infra / Inter-Node Network`
    - `Infra / Endpoint Reachability`
    - `Infra / WireGuard & Underlay`
    - `Infra / Node Network Health`
  - `WireGuard & Underlay` 已补充 `Kilo Mesh Nodes`、`Kilo Errors (10m)`、`Kilo Reconcile & iptables Activity`
  - `Inter-Node Network` 已拆分为 `internal` 与 `public/apiserver/icmp` 两类方向视图，并增加 `module` 过滤
  - `Endpoint Reachability` 已改为按 `target_endpoint + module` 展示，避免 `http / https / icmp` 聚合歧义
  - 后续修正：主动探测优先改用 `public-ip` / `ExternalIP` / `ClusterIP`，避免把 DNS 超时误判成网络延迟；只有缺少公网 IP 时才退回 `public-endpoint`
  - 后续修正：`https_apiserver_livez` 接受 `200` 与 `401`
    - 原因：当前 k3s 对公网 `https://<public-ip>:6443/livez` 匿名访问返回 `401`
    - 对网络探测语义来说，`401` 仍代表 TCP/TLS 与 apiserver 响应链路健康
  - 核查结果：修正完成后重新检查 `probe_success==0`，当前无持续失败项

## 4. 回滚

- `kubectl delete -k infra/platform/monitoring/network/phase2-link-metrics`
- `kubectl delete -k infra/platform/monitoring/network/phase1-probes`
- `bash infra/platform/monitoring/grafana/scripts/apply-folder.sh infra`
