# 2026-04-04 Edge Gateway Traffic Observability

## 背景

现有 `Infra / Edge Gateway` 主要回答：

- 代理通不通
- 出口 IP 对不对
- 端到端时延高不高

但还缺一层“主机级流量与连接态势”：

- 广州入口公网口是否真有吞吐
- `GZ -> SG` 的 `Kilo` 隧道是否有吞吐
- 代理端口是否出现连接堆积

## 本次变更

- 新增 `edge-gateway-traffic-exporter` DaemonSet
  - 位置：`infra/platform/monitoring/network/edge-gateway/traffic-exporter.yaml`
  - 部署范围：所有 `edge.role` 节点
  - 运行方式：`hostNetwork`
- 新增 `edge_gateway_traffic_exporter.py`
  - 位置：`infra/platform/monitoring/network/edge-gateway/edge_gateway_traffic_exporter.py`
  - 指标：
    - `edge_gateway_interface_bytes_total`
    - `edge_gateway_interface_packets_total`
    - `edge_gateway_interface_errors_total`
    - `edge_gateway_interface_drops_total`
    - `edge_gateway_proxy_tcp_connections`
    - `edge_gateway_proxy_active_connections`
    - `edge_gateway_proxy_udp_sockets`
- 新增 Grafana dashboard：
  - `Infra / Edge Gateway Traffic`
  - UID：`infra-edge-gateway-traffic`

## 设计选择

- 不引入 `eBPF`
- 不做按请求的 L7 统计
- 先做主机级接口吞吐与代理端口连接数

原因：

- 这套指标足够回答“是不是没带宽”、“是不是隧道没流量”、“是不是连接堆积”
- 常驻开销低，适合 homelab 长期运行

## 验证

- `edge-gateway-traffic-exporter` 已在：
  - `vm-8-11-ubuntu`
  - `vm-0-11-ubuntu`
  正常运行
- exporter 已识别：
  - `public_interface=eth0`
  - `kilo_interface=kilo0`
- VictoriaMetrics 已能查询到：
  - `edge_gateway_traffic_info`
  - `edge_gateway_interface_bytes_total`
  - `edge_gateway_proxy_active_connections`

## 已知边界

- 当前吞吐是“宿主机接口级别”，不是“单用户/单订阅/单请求”的精确流量
- 如果以后要做精确流量计数，可在下一阶段评估：
  - `nftables/iptables counter`
  - 应用层 stats API
  - `eBPF`
