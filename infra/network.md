# 集群网络架构（k3s + Kilo，跨地域两节点）

本文档解释当前 homelab k3s 集群的网络设计与对外暴露边界，便于你后续部署/排障。

## 1. TL;DR（你最关心的）

- `ClusterIP`/PodIP **默认都无法从公网直接访问**（它们属于集群内部虚拟网段）。
- 对外暴露通常只来自：
  - `gz` 的 apiserver：`6443/tcp`（用于 kubeconfig 连接集群）
  - `NodePort`（例如 ingress-nginx 的 `30635/31372`）
  - 未来若使用 `LoadBalancer`/云 LB/反向代理，则以其为入口
- 跨地域（gz/sg 私网不互通）时，Kilo/WireGuard 与 apiserver 都必须走 **公网 endpoint**：
  - WireGuard：`UDP/51820`（通过 `kilo.squat.ai/force-endpoint=<公网IP>:51820` 固定）
  - apiserver Endpoints：固定为 `gz` 公网（避免启动闭环）

## 2. 当前地址空间（以实测为准）

### 2.1 节点 Underlay（云主机网卡）

见库存：`infra/inventory/hosts.yaml`

- gz（master）
  - 内网：`10.0.8.11`
  - 公网：`106.55.163.135`
- sg（worker）
  - 内网：`10.3.0.11`
  - 公网：`43.156.60.56`

### 2.2 PodCIDR（每节点一个 /24）

从节点对象读取（示例输出）：

```bash
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.podCIDR}{"\n"}{end}'
```

当前：

- gz：`10.42.0.0/24`
- sg：`10.42.1.0/24`

### 2.3 Service CIDR（ClusterIP）

ClusterIP 属于 Service CIDR（k3s 默认通常为 `10.43.0.0/16`），例如：

```bash
kubectl -n default get svc kubernetes -o wide
```

当前：

- `kubernetes` Service：`10.43.0.1:443`

### 2.4 Kilo/WireGuard mesh 网段

Kilo 在每个节点创建 WireGuard interface（`kilo0`），并分配 mesh IP（示例）：

```bash
ssh gz.butcoder.com "ip -4 addr show kilo0; sudo wg show"
ssh sg.butcoder.com "ip -4 addr show kilo0; sudo wg show"
```

当前 mesh 网段为 `10.4.0.0/16`（两端分别为 `10.4.0.1` / `10.4.0.2`）。

## 3. 数据面：Pod/Service 流量怎么走

### 3.1 CNI（Pod 出入栈）

我们在 k3s 安装时禁用了 flannel（`--flannel-backend=none`），由 Kilo 提供 CNI。

Kilo 会在节点上安装 CNI 配置（`/etc/cni/net.d/10-kilo.conflist`），其核心逻辑是：

- `bridge`：创建/使用 `kube-bridge` 作为 Pod 二层网桥
- `portmap`：支持 `hostPort` 等端口映射（并做 SNAT）

### 3.2 Pod → Pod（跨节点）

当 `gz` 上的 Pod 访问 `sg` 的 Pod（例如 `10.42.1.2`）时：

1. 目的地址命中对端 PodCIDR（`10.42.1.0/24`）
2. 节点路由表由 Kilo 写入：把对端 PodCIDR 的流量引到 `kilo0`
3. `kilo0` 通过 WireGuard 加密把包发到对端节点公网 endpoint（`UDP/51820`）
4. 对端解密后送回其 `kube-bridge`，最终到达目标 Pod

### 3.3 Pod → Service（ClusterIP）

访问 ClusterIP（例如 `10.43.x.y:port`）时：

1. DNS（CoreDNS）把 `*.svc.cluster.local` 解析为 ClusterIP
2. k3s 的 kube-proxy 组件在节点上维护 iptables 规则：把 ClusterIP 的流量 DNAT 到某个后端 PodIP
3. 若后端 Pod 在对端节点，继续走 “3.2 Pod → Pod（跨节点）” 的 WireGuard 路径

## 4. 控制面：apiserver 连接与跨地域启动闭环

### 4.1 为什么要固定 apiserver Endpoints 为 gz 公网

跨地域下，gz/sg 的云内网（`10.x`）通常不可互通。

如果集群内部 `kubernetes.default` 的 Endpoints 指向了 gz 内网（例如 `10.0.8.11:6443`），那么 sg 上的组件（尤其是 CNI/Kilo）在“WireGuard mesh 还没建好之前”无法访问 apiserver，会形成启动闭环。

因此我们在 gz 上设置：

- `/etc/rancher/k3s/config.yaml`：`advertise-address` + `node-external-ip`（不设置 `node-ip` 为公网 IP）
- 重启 k3s 后，`kubernetes.default` Endpoints 固定为 `106.55.163.135`

验证：

```bash
kubectl -n default get endpoints kubernetes -o jsonpath='{.subsets[*].addresses[*].ip}{"\n"}'
```

## 5. 对外暴露边界：哪些能从公网访问

### 5.1 默认不可公网直连

- PodIP（`10.42.0.0/16`）：集群内部网段
- ClusterIP（`10.43.0.0/16`）：节点 iptables 虚拟 VIP，仅在集群内有效

### 5.2 可能对公网开放（取决于安全组/防火墙）

- apiserver：`gz:6443/tcp`（你的 kubeconfig 就是连它）
- NodePort：`<节点公网IP>:30000-32767`
  - 例如当前 ingress-nginx：`gz:30635/tcp`（HTTP）、`gz:31372/tcp`（HTTPS）

> 结论：如果你把安全组“全放通”，那 NodePort 基本等同于对公网开放服务入口。建议按 `infra/ports.md` 进行最小化收敛。

## 6. 运维检查（网络相关）

### 6.1 查看节点网络关键接口/路由（在节点上）

```bash
ssh gz.butcoder.com "ip -4 addr; ip -4 route | egrep '10\\.42\\.|10\\.43\\.|10\\.4\\.' || true"
ssh sg.butcoder.com "ip -4 addr; ip -4 route | egrep '10\\.42\\.|10\\.43\\.|10\\.4\\.' || true"
```

### 6.2 WireGuard peer 是否握手（在节点上）

```bash
ssh gz.butcoder.com "sudo wg show"
ssh sg.butcoder.com "sudo wg show"
```

关注点：

- `latest handshake` 是否持续更新
- `transfer` 是否有收发流量

### 6.3 `iptables FORWARD`（非常关键）

如果出现“节点上 curl 通，但 Pod 内 curl 跨节点超时”，优先检查 `gz` 的 FORWARD 策略：

```bash
ssh gz.butcoder.com "sudo iptables -S FORWARD | head -n 1"
```

我们已在 gz 上落盘 `iptables-forward-accept.service`，确保 FORWARD 保持 `ACCEPT`（见变更单：`infra/changes/20260301-k3s-init.md`）。

