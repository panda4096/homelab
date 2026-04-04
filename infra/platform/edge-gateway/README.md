# edge-gateway（广州入口 / 新加坡出口）

本目录维护跨地域代理网关的 **Phase 1 可实施资产**。

当前实现边界：

- `gz`：`GOST` 做 TCP/UDP 端口转发
- `sg`：`sing-box` 承接代理协议并直接出公网
- `gz`：轻量订阅服务提供静态订阅文件
- 已落地协议：
  - `SOCKS5`
  - `HTTP CONNECT`
  - `Shadowsocks`

## 目录

- `kustomization.yaml`
- `namespace.yaml`
- `ingress-gost-configmap.yaml`
- `ingress-gost-daemonset.yaml`
- `egress-singbox-daemonset.yaml`
- `subscription-server-daemonset.yaml`
- `config/values.example.yaml`
- `scripts/render-egress-config.sh`
- `scripts/build-gost.sh`
- `scripts/render-runtime-assets.rb`
- `scripts/apply-runtime-assets.sh`

## 当前端口

| 协议 | 广州公网入口 | 新加坡监听 | 说明 |
|---|---:|---:|---|
| SOCKS5 | `11080` | `10.4.0.2:11080` | `TCP + UDP` |
| HTTP CONNECT | `11081` | `10.4.0.2:11081` | `TCP` |
| Shadowsocks | `18388` | `10.4.0.2:18388` | `TCP + UDP` |
| 订阅服务 | `11800` | `gz:11800` | 静态 HTTP 订阅 |

## 部署前提

1. `kubectl get nodes -o wide` 全部 `Ready`
2. `Kilo` 正常，`sg` 的 Kilo IP 为 `10.4.0.2`
3. 节点标签已补齐：

```bash
export KUBECONFIG="$(pwd)/infra/.secrets/homelab-k3s.yaml"
kubectl label node vm-8-11-ubuntu edge.role=ingress edge.location=gz --overwrite
kubectl label node vm-0-11-ubuntu edge.role=egress edge.location=sg --overwrite
```

4. 在本地构建并同步 `gost` 二进制到 `gz`：

```bash
tmp_bin="$(mktemp)"
bash infra/platform/edge-gateway/scripts/build-gost.sh "$tmp_bin"
ssh gz.butcoder.com 'sudo mkdir -p /opt/edge/bin'
scp "$tmp_bin" gz.butcoder.com:/tmp/gost
ssh gz.butcoder.com 'sudo install -m 0755 /tmp/gost /opt/edge/bin/gost && rm -f /tmp/gost'
rm -f "$tmp_bin"
```

## 运行时配置源

运行时 source-of-truth 使用本地 YAML 文件，建议放在：

- `infra/.secrets/edge-gateway-values.yaml`

可先从示例复制：

```bash
cp infra/platform/edge-gateway/config/values.example.yaml infra/.secrets/edge-gateway-values.yaml
```

该文件用于统一生成：

- `edge-egress-config` Secret
- `edge-subscription-files` ConfigMap
- `Clash` / `sing-box` / `Shadowrocket` 订阅文件

## 生成运行时资产

不要把凭据写入 repo。部署时在本地通过 YAML 生成：

```bash
export KUBECONFIG="$(pwd)/infra/.secrets/homelab-k3s.yaml"
bash infra/platform/edge-gateway/scripts/apply-runtime-assets.sh infra/.secrets/edge-gateway-values.yaml
```

## 部署

```bash
export KUBECONFIG="$(pwd)/infra/.secrets/homelab-k3s.yaml"
kubectl apply -k infra/platform/edge-gateway
kubectl -n edge-system rollout status daemonset/edge-ingress-gateway --timeout=300s
kubectl -n edge-system rollout status daemonset/edge-egress-gateway --timeout=300s
kubectl -n edge-system rollout status daemonset/edge-subscription-server --timeout=300s
kubectl -n edge-system get ds,pods -o wide
```

## 端到端验证

### HTTP CONNECT

```bash
curl --proxy "http://edge-user:<password>@gz.butcoder.com:11081" https://api.ipify.org
```

预期：

- 返回 `sg` 节点公网 IP

### SOCKS5

```bash
curl --proxy "socks5h://edge-user:<password>@gz.butcoder.com:11080" https://api.ipify.org
```

预期：

- 返回 `sg` 节点公网 IP

### Shadowsocks

建议用 `Shadowrocket`、`ClashX`、`Mihomo` 或本地 `sing-box` 客户端验证，服务端参数：

- server: `gz.butcoder.com`
- port: `18388`
- method: `chacha20-ietf-poly1305`
- password: `<EDGE_SS_PASSWORD>`

## 使用说明

### 查看当前凭据

如需从集群运行态读取当前配置与订阅：

```bash
export KUBECONFIG="$(pwd)/infra/.secrets/homelab-k3s.yaml"
kubectl -n edge-system get secret edge-egress-config -o json \
  | jq -r '.data["config.json"]' \
  | base64 --decode

kubectl -n edge-system get configmap edge-subscription-files -o json \
  | jq -r '.data | keys[]'
```

### 订阅地址

订阅地址由 `infra/.secrets/edge-gateway-values.yaml` 中的：

- `cluster.subscription.host`
- `cluster.subscription.port`
- `cluster.subscription.token`

共同决定。

当前运行态使用：

- `http://106.55.163.135:11800/`

原因：

- `gz.butcoder.com:11800` 当前会被外层服务重定向，不会直接到达节点上的订阅服务器
- 因此高端口订阅当前应使用 `gz` 公网 IP

渲染结果包括：

- `http://<host>:<port>/clash-<token>.yaml`
- `http://<host>:<port>/sing-box-<token>.json`
- `http://<host>:<port>/shadowrocket-<token>.txt`
- `http://<host>:<port>/index-<token>.json`

### Shadowrocket

推荐优先使用 `shadowrocket.txt` 订阅地址做自动更新；手工导入时也可使用下列参数。

- `HTTP` 节点：
  - server: `gz.butcoder.com`
  - port: `11081`
  - username/password: 对应 `EDGE_HTTP_*`
- `SOCKS5` 节点：
  - server: `gz.butcoder.com`
  - port: `11080`
  - username/password: 对应 `EDGE_SOCKS_*`
- `Shadowsocks` 节点：
  - server: `gz.butcoder.com`
  - port: `18388`
  - method/password: 对应 `EDGE_SS_*`

### ClashX / Mihomo

推荐直接使用 `clash-<token>.yaml` 订阅地址。手工添加时可使用单节点：

```yaml
proxies:
  - name: homelab-socks
    type: socks5
    server: gz.butcoder.com
    port: 11080
    username: edge-user
    password: <password>

  - name: homelab-http
    type: http
    server: gz.butcoder.com
    port: 11081
    username: edge-user
    password: <password>

  - name: homelab-ss
    type: ss
    server: gz.butcoder.com
    port: 18388
    cipher: chacha20-ietf-poly1305
    password: <password>
```

## 维护

### 查看运行状态

```bash
export KUBECONFIG="$(pwd)/infra/.secrets/homelab-k3s.yaml"
kubectl -n edge-system get ds,pods -o wide
kubectl -n edge-system logs ds/edge-ingress-gateway --tail=50
kubectl -n edge-system logs ds/edge-egress-gateway --tail=50
kubectl -n edge-system logs ds/edge-subscription-server --tail=50
```

### 轮换凭据

1. 修改 `infra/.secrets/edge-gateway-values.yaml`
2. 重新生成运行时资产
3. 重启 `edge-egress-gateway`

```bash
bash infra/platform/edge-gateway/scripts/apply-runtime-assets.sh infra/.secrets/edge-gateway-values.yaml
kubectl -n edge-system rollout restart daemonset/edge-egress-gateway
kubectl -n edge-system rollout status daemonset/edge-egress-gateway --timeout=300s
```

如改了端口、入口节点或订阅 token，需同时重启：

- `edge-ingress-gateway`
- `edge-subscription-server`

### 升级 `gost`

```bash
tmp_bin="$(mktemp)"
bash infra/platform/edge-gateway/scripts/build-gost.sh "$tmp_bin"
scp "$tmp_bin" gz.butcoder.com:/tmp/gost
ssh gz.butcoder.com 'sudo install -m 0755 /tmp/gost /opt/edge/bin/gost && rm -f /tmp/gost'
rm -f "$tmp_bin"
kubectl -n edge-system rollout restart daemonset/edge-ingress-gateway
kubectl -n edge-system rollout status daemonset/edge-ingress-gateway --timeout=300s
```

### 回滚

```bash
kubectl -n edge-system rollout undo daemonset/edge-ingress-gateway
kubectl -n edge-system rollout undo daemonset/edge-egress-gateway
```

### 下线

```bash
kubectl delete -k infra/platform/edge-gateway
kubectl -n edge-system delete secret edge-egress-config
kubectl -n edge-system delete configmap edge-subscription-files
```
