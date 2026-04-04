# 变更单：edge gateway Phase 1 上线（HTTP / SOCKS5 / Shadowsocks）

- 日期：2026-04-04
- 变更人：Codex
- 状态：Done
- 关联版本锁定：`infra/k3s/versions.yaml`

## 1. 目的与范围

- 目的：
  - 在现有 `gz -> Kilo -> sg` 基础上落地第一版跨地域代理网关
- 端到端打通 `HTTP CONNECT`、`SOCKS5`、`Shadowsocks`
- 提供静态订阅服务，支持客户端一键更新
  - 提供可重复的部署、验证和维护文档
- 影响范围（命名空间/服务/节点）：
  - namespace：`edge-system`
  - node：`vm-8-11-ubuntu`（ingress）
  - node：`vm-0-11-ubuntu`（egress）
- 预期停机/抖动：
  - 新增代理服务，无现有集群业务停机

## 2. 风险评估

- 主要风险：
  - `gz` 无法从 Docker Hub 稳定拉取 `gogost/gost` 镜像
  - `sg` 代理端口误绑定公网
  - 探针误探测节点主 IP 导致误判不健康
- 缓解措施：
  - ingress 改为 `busybox + 宿主机 gost 静态二进制`
  - egress `sing-box` 只绑定 `10.4.0.2`
  - egress 探针显式探测 `10.4.0.2:11081`

## 3. 变更前检查（必须）

- [x] `kubectl get nodes -o wide`：全部 Ready
- [x] `kubectl get pods -A -o wide`：核心组件健康
- [x] 磁盘空间充足（尤其是 master）
- [x] 端口/安全组检查（见 `infra/03-端口与安全组.md`）

## 4. 变更内容（引用 repo 文件路径）

- 新增平台组件：
  - `infra/platform/edge-gateway/`
- 更新架构文档：
  - `infra/06-跨地域代理网关架构.md`
- 更新端口文档：
  - `infra/03-端口与安全组.md`
- 更新索引：
  - `infra/README.md`
  - `infra/platform/README.md`

## 5. 执行步骤（含命令与“在哪里执行”）

1. 本地：为节点补标签
2. 本地：生成 `edge-egress-config` Secret
3. 本地：构建 `gost` Linux/amd64 静态二进制
4. gz：安装 `/opt/edge/bin/gost`
5. 本地：`kubectl apply -k infra/platform/edge-gateway`
6. 本地：等待 `edge-ingress-gateway` / `edge-egress-gateway` rollout 完成
7. 本地：分别用 `curl` 验证 `HTTP` / `SOCKS5`
8. 本地：安装 `sing-box` 客户端并通过 `Shadowsocks` 验证

## 6. 验证项（必须可重复）

- [x] `kubectl -n edge-system get ds,pods -o wide`
- [x] `HTTP CONNECT` 出口 IP 为 `43.156.60.56`
- [x] `SOCKS5` 出口 IP 为 `43.156.60.56`
- [x] `Shadowsocks` 出口 IP 为 `43.156.60.56`
- [x] `sg` 服务绑定在 `10.4.0.2`
- [x] 订阅 URL 可访问，且下载的 `sing-box` 配置可直接工作

## 7. 回滚步骤（必须可操作）

- 删除工作负载：

```bash
kubectl delete -k infra/platform/edge-gateway
kubectl -n edge-system delete secret edge-egress-config
```

- 如需清理 `gz` 宿主机二进制：

```bash
ssh gz.butcoder.com 'sudo rm -f /opt/edge/bin/gost'
```

## 8. 结果与后续

- 结果（贴关键输出摘要，避免敏感信息）：
  - `edge-ingress-gateway`：`1/1 Ready`
  - `edge-egress-gateway`：`1/1 Ready`
  - `curl --proxy http://...:11081 https://api.ipify.org` → `43.156.60.56`
  - `curl --proxy socks5h://...:11080 https://api.ipify.org` → `43.156.60.56`
  - 本地 `sing-box` 客户端经 `Shadowsocks` 出站验证 → `43.156.60.56`
  - `http://106.55.163.135:11800/index-egw-20260404-9a7c3d.json` 可访问
  - 下载 `sing-box` 订阅后本地运行，出口仍为 `43.156.60.56`
- 后续工作（Runbook/ports/versions 是否需要更新）：
  - 后续补 `Trojan` / `VLESS` / `Hysteria2` / `TUIC`
  - 进一步建设统一订阅渲染与用户控制面
