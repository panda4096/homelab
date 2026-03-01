# 端口与安全组清单（最小开放）

目标：只开放集群运行所必须的端口；**默认不对公网开放任何“通用代理/管理入口”**。

> 本文件记录“应开端口 + 实测端口”。实测以运行后在节点上执行 `ss -lntup` / `ss -lunp` / `wg` 为准。

## 必开（两节点：sg → gz）

- k3s API：`6443/tcp`
  - 流向：`sg` 必须能访问 `gz:6443`
  - 安全组策略：仅允许 `sg` 的公网 IP（或固定出口）访问；不要全网放开

## Kilo / WireGuard（节点间 UDP）

- 端口：**以实测为准**
  - 记录方法：
    - 在两台节点分别执行：`sudo ss -lunp | grep -i udp`
    - 如已安装 `wireguard-tools`：`sudo wg show`
  - 将最终开放的 UDP 端口记录到此处（并限制来源为对端节点 IP）

实测（2026-03-01）：

- gz：`51820/udp`（`wg show` 显示 interface `kilo0` listening port `51820`）
- sg：`51820/udp`（`wg show` 显示 interface `kilo0` listening port `51820`）

> 备注：跨地域场景下，如果节点间私网 IP 不可路由，Kilo 可能会自动选择私网作为 endpoint，导致互联失败。
> 需要在节点上显式设置：`kilo.squat.ai/force-endpoint=<PUBLIC_IP>:51820`（见 `infra/集群搭建.md`）。

## NodePort 使用登记（避免冲突）

> NodePort 默认范围通常是 `30000-32767`；建议避免手工固定端口，除非确有需要。

已知占用/保留：

| 端口 | 协议 | 用途 | 归属 |
|---:|---|---|---|
| 30090 | TCP/UDP | clash http | `net/clash`（Service `clash-nodeport`） |
| 30091 | TCP/UDP | clash socks | `net/clash`（Service `clash-nodeport`） |
| 30635 | TCP | ingress-nginx http | `ingress-nginx`（Service `ingress-nginx-controller`） |
| 31372 | TCP | ingress-nginx https | `ingress-nginx`（Service `ingress-nginx-controller`） |

## 不建议公开暴露

- 任何“通用代理”（HTTP/SOCKS）服务
- kubeconfig / kube-apiserver 的非必要公网访问
- 运维面板（如未来安装的 Dashboard / Argo / Grafana 等）默认先走内网或 SSH 端口转发
