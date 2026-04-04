# 2026-04-04 edge gateway egress dns fix

## 背景

在 `Infra / Edge Gateway` dashboard 与人工复测中观察到：

- `edge_public_tcp` / `edge_relay_tcp` 都正常
- 广州入口与 `GZ -> SG` relay 端口可达
- 但真实代理请求明显偏慢，且波动大

同时 `sing-box` 日志出现：

- `lookup api.ipify.org: exchange4: context deadline exceeded`

说明问题集中在 `sg` 出口侧的域名解析，而不是广州入口监听或 Kilo relay。

## 修复

在 `infra/platform/edge-gateway/scripts/render-runtime-assets.rb` 中为 `sg` 的 `sing-box` 增加显式 DNS 配置：

- `dns.servers`
- `dns.final`
- `dns.strategy`
- `route.default_domain_resolver`

运行时 source-of-truth 新增：

- `cluster.egress.dns_strategy`
- `cluster.egress.dns_servers`

当前默认值：

- `1.1.1.1`
- `1.0.0.1`
- `8.8.8.8`
- `8.8.4.4`

均为纯 IP UDP DNS，避免再次走宿主机默认 DNS。

## 结果

修复前人工复测：

- `HTTP CONNECT generate_204`: `6.076999s`
- `SOCKS5 generate_204`: `3.304520s`
- `HTTP CONNECT ipify`: 失败或 `11s+`

修复后人工复测：

- `HTTP CONNECT generate_204`: `1.538114s`
- `SOCKS5 generate_204`: `0.964073s`
- `HTTP CONNECT ipify`: `0.497099s`
- `SOCKS5 ipify`: `2.365642s`

修复后 `edge_gateway_probe_duration_seconds` 也明显下降：

- `http_connect_generate_204`: `~1.15s`
- `http_connect_ip_echo`: `~0.25s`
- `socks5_generate_204`: `~0.07s`
- `socks5_ip_echo`: `~0.07s`

修复后 5 分钟内 `sing-box` 日志未再出现：

- `lookup`
- `exchange4`
- `context deadline exceeded`

## 结论

新加坡出口默认 DNS 解析质量差，已被显式上游 DNS 替换后显著改善。

当前链路仍然不是“低延迟精品线路”，但已从“接近不可用”恢复到“可用并可继续观察优化”的状态。
