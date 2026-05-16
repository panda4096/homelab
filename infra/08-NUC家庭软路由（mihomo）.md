# 08-NUC 家庭软路由（mihomo）

本文记录 `nuc` 节点作为家庭 LAN 软路由的当前实现，承担家中 PS5 / Switch / Apple TV / Mac / 手机等设备的透明代理。是 `infra/` 下的 **现状说明 + 维护入口**，不是设计草案。

底层依赖：

- 节点本身：见 [`infra/inventory/hosts.yaml`](inventory/hosts.yaml) 里的 `nuc` 条目
- 与跨地域代理的关系：本文档的代理出口是 yiy / edge-gateway 等订阅，**与 `06-跨地域代理网关架构` 中的 `gz/sg` 业务代理链路相互独立**

## 1. 起点与边界

起点：`nuc` 上已经装好独立 `k3s`（单节点 control-plane+master，flannel CNI），与 `homelab-k3s`（gz+sg）主集群**不互联**。然后在同一台 NUC 的宿主机上额外跑 `mihomo`（Clash.Meta）做家庭软路由。

边界：

- 软路由是 **systemd 单进程**，**不在 k3s 里跑**。设计上故意不容器化：mihomo 要创 TUN + 接管路由 + 监听 :53，与 k3s pod 网络（10.42/16 + 10.43/16）共存需要明确隔离，宿主机进程比 pod 简单
- 软路由只服务**家庭 LAN**（`192.168.100.0/24`），不对公网暴露
- mihomo 的 9090 控制面与 7890 mixed-port 只在 LAN 可达，无认证（仅 secret）

## 2. 当前实际拓扑

```text
家庭 LAN (192.168.100.0/24)
├─ 192.168.100.1   光猫 / DHCP 网关
├─ 192.168.100.29  NUC (本机)
│  ├─ wlp0s20f3    上行 Wi-Fi (唯一 default route，eno1 NO-CARRIER)
│  ├─ Meta         mihomo TUN 设备
│  ├─ cni0/flannel.1/veth*  k3s pod 网络（10.42/16 + 10.43/16）
│  └─ mihomo (systemd)
│     ├─ :53       DNS（fake-ip 198.18.0.1/16）
│     ├─ :7890     mixed-port (HTTP + SOCKS5)
│     ├─ :9090     external-controller + Web UI
│     └─ TUN       透明代理（auto-route，路由表全劫持）
├─ 192.168.100.17  Mac (本机日常)
├─ 192.168.100.50  PS5 / Apple TV App / 其他 Apple 设备
└─ ...
```

设备如何走透明代理：**把网关或 DNS 指向 `192.168.100.29`**。两种姿势都可：

- 网关 + DNS 都指 NUC：完整透明代理（推荐 PS5/Switch）
- 仅 DNS 指 NUC（网关仍指光猫）：mihomo 用 fake-ip 198.18/16 + dns-hijack 接管，等效于"DNS 触发的代理"

## 3. mihomo 安装与启动

- 二进制：`/usr/local/bin/mihomo`（手动维护，未走 apt 包管理）
- 配置目录：`/etc/mihomo/`
  - `config.yaml` — 主配置（手编辑，**不在本 repo 里**，含订阅 secret）
  - `providers/edge-gateway.yaml` / `providers/yiy.yaml` — 订阅缓存（自动刷新）
  - `ruleset/*.txt` — rule-providers 缓存（自动刷新，见 §5）
  - `ui/` — Web UI 静态文件
- systemd unit：`/etc/systemd/system/mihomo.service`，关键设置：
  - `ExecStart=/usr/local/bin/mihomo -d /etc/mihomo`
  - `ExecReload=/bin/kill -HUP $MAINPID` — `systemctl reload mihomo` 触发热重载（不重启进程）
  - `AmbientCapabilities=CAP_NET_ADMIN CAP_NET_BIND_SERVICE CAP_NET_RAW` — 允许创 TUN / 改路由 / 绑 53

> 提示：mihomo 的 `config.yaml` 是手工维护，本 repo 不入库（含订阅 URL 与 9090 secret）。仅本文档维护**结构**说明。

## 4. 当前配置结构（关键段落）

按出现顺序：

### 4.1 基本

```yaml
mixed-port: 7890           # HTTP + SOCKS5 共用，LAN 显式代理入口
allow-lan: true
interface-name: wlp0s20f3  # 显式锁死出口网卡（见 §6 风险）
ipv6: false
external-controller: 0.0.0.0:9090
secret: "<REDACTED>"       # 仅本机文件，本 repo 不入库
external-ui: /etc/mihomo/ui
```

### 4.2 Sniffer（TLS SNI / HTTP Host / QUIC）

弥补 App 自带 DoH 绕过 mihomo DNS 导致的规则失配：

```yaml
sniffer:
  enable: true
  force-dns-mapping: true   # 把 fake-ip 反解为真实域名再做规则匹配
  parse-pure-ip: true       # App 自己解析的纯 IP 直连也 sniff
  override-destination: true
  sniff:
    HTTP: { ports: [80, 8080-8880] }
    TLS:  { ports: [443, 8443] }
    QUIC: { ports: [443] }
  skip-domain:
    - "+.push.apple.com"    # APNS 长连接不要 sniff
    - "Mijia Cloud"         # 米家设备 cert pinning
```

### 4.3 DNS（fake-ip 模式 + LAN :53 监听）

```yaml
dns:
  enable: true
  listen: 192.168.100.29:53
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  fake-ip-filter:           # 这些域名不走 fake-ip，返回真实 IP
    - '*.lan' / '*.local' / '*.localdomain'
    - 'localhost.ptlogin2.qq.com'
    - 'time.*.com' / 'ntp.*.com'
    - '+.market.xiaomi.com'
  default-nameserver: [223.5.5.5, 119.29.29.29]    # 引导 DoH 域名的 plain DNS
  nameserver:                                      # 国内域名解析
    - https://dns.alidns.com/dns-query
    - https://doh.pub/dns-query
  fallback:                                        # 海外域名解析（经代理出去）
    - https://1.1.1.1/dns-query
    - https://dns.google/dns-query
  fallback-filter:
    geoip: true
    geoip-code: CN
```

### 4.4 TUN（透明代理）

```yaml
tun:
  enable: true
  stack: system
  device: Meta
  auto-route: true
  auto-detect-interface: false   # 关掉，与 interface-name 配套（见 §6）
  dns-hijack: [any:53, tcp://any:53]
  route-exclude-address:         # 关键：排除 k3s pod/service 段，避免劫持集群流量
    - 10.42.0.0/16
    - 10.43.0.0/16
```

### 4.5 订阅（proxy-providers）

```yaml
proxy-providers:
  edge-gateway:    # 自建 SG 出口（见 06 跨地域代理）
    type: http
    url: http://106.55.163.135:11800/clash-egw-<REDACTED>.yaml
  yiy:             # 商业订阅（HK/TW/JP/SG/US 节点，按命名带 HKT家宽/家宽/原生 等标识）
    type: http
    url: https://cdn.yiycom.com/s/<REDACTED>
```

### 4.6 代理分组（proxy-groups）

| 组名 | 类型 | 成员 | 用途 |
|---|---|---|---|
| `PROXY` | select | AUTO-EDGE / AUTO-YIY / DIRECT + 订阅全量 | 主出口（默认境外流量） |
| `AUTO-EDGE` | url-test | edge-gateway 全部 | 自建 SG 出口自动选最快 |
| `AUTO-YIY` | url-test | yiy 全部 | yiy 订阅自动选最快 |
| `APPLE-HK-HOME` | url-test | yiy `filter:"HKT家宽"` → 7 节点 | Apple 全家桶专用，固定 HKT 家宽 IP 段避开 Apple IDC 风控 |
| `SWITCH-JP` | url-test | yiy `filter:"日本"` → 5 节点 | Switch / Nintendo 服务 |

### 4.7 规则订阅（rule-providers）

从 [Loyalsoldier/clash-rules](https://github.com/Loyalsoldier/clash-rules) `release` 分支拉取，每日自动更新：

| provider | 规则数 | behavior | 用途 |
|---|---|---|---|
| `reject` | ~174K | domain | 广告 / 隐私域名 → `REJECT` |
| `apple` | ~164 | domain | Apple 服务（比内置 GEOSITE,apple 更精，已排除 apple-cn） |
| `gfw` | ~4.2K | domain | GFW 名单精准走代理（MATCH 之前的兜底） |

URL 模板：`https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/<name>.txt`（格式 `format: text`，**不是 yaml**）。落盘 `/etc/mihomo/ruleset/<name>.txt`。

### 4.8 规则（rules，按优先级）

```yaml
rules:
  - RULE-SET,reject,REJECT                  # 广告先拦
  - RULE-SET,apple,APPLE-HK-HOME            # Apple → HKT 家宽
  # 私网直连
  - IP-CIDR,127.0.0.0/8,DIRECT,no-resolve
  - IP-CIDR,10.0.0.0/8,DIRECT,no-resolve
  - IP-CIDR,172.16.0.0/12,DIRECT,no-resolve
  - IP-CIDR,192.168.0.0/16,DIRECT,no-resolve
  - IP-CIDR,169.254.0.0/16,DIRECT,no-resolve
  - IP-CIDR,224.0.0.0/4,DIRECT,no-resolve
  # Switch
  - GEOSITE,nintendo,SWITCH-JP
  - DOMAIN-SUFFIX,nintendo.net,SWITCH-JP    # + 6 条 nintendo 域名兜底
  ...
  # Apple 兜底（RULE-SET,apple 失效时用 mihomo 内置 geosite）
  - GEOSITE,apple,APPLE-HK-HOME
  # 国内直连
  - GEOIP,CN,DIRECT
  - GEOSITE,cn,DIRECT
  # GFW 精准走代理
  - RULE-SET,gfw,PROXY
  # 兜底
  - MATCH,PROXY
```

## 5. 常用运维操作

> 所有命令在 `NUC` 上执行（`ssh NUC` alias，见 `infra/inventory/hosts.yaml`）。`config.yaml` 与 systemd 操作需 `sudo`，已配 `NOPASSWD`。

### 5.1 改配置 + 应用

```bash
# 1. 备份（按场景命名）
sudo cp /etc/mihomo/config.yaml /etc/mihomo/config.yaml.bak.<reason>.$(date +%Y%m%d-%H%M%S)

# 2. 编辑
sudo $EDITOR /etc/mihomo/config.yaml

# 3. 语法测试
sudo /usr/local/bin/mihomo -t -d /etc/mihomo

# 4. 应用（区别见下表）
sudo systemctl reload mihomo    # 大多数改动用 reload（SIGHUP 热重载，零瞬断）
sudo systemctl restart mihomo   # TUN/网卡相关改动需要 restart（瞬断 LAN 代理 ~3s）
```

| 改动类型 | reload 够 | 必须 restart |
|---|---|---|
| 加规则 / 改分组 / 改 rule-providers | ✅ | |
| 改订阅 URL / DNS / sniffer | ✅ | |
| 改 `tun:` 子项（device / auto-detect / route-exclude） | | ✅ |
| 改顶层 `interface-name` | | ✅ |

### 5.2 查看日志 / warning

```bash
# 实时
sudo journalctl -u mihomo -f

# 最近 1 小时所有 warning（最有用）
sudo journalctl -u mihomo --since '1 hour ago' --no-pager | grep -iE 'warn|error'

# 按 warning 类型统计
sudo journalctl -u mihomo --since '1 hour ago' --no-pager \
  | grep -oE 'level=warning msg="\[[A-Z]+\][^"]{1,40}' | sort | uniq -c | sort -rn
```

### 5.3 控制面 API（curl）

```bash
SECRET="<填 config.yaml 里的 secret>"
API="http://127.0.0.1:9090"
AUTH=(-H "Authorization: Bearer $SECRET")

# 查某个组的成员和当前活跃节点
curl -s "${AUTH[@]}" $API/proxies/APPLE-HK-HOME | python3 -m json.tool

# 查所有 rule-provider 的拉取状态
curl -s "${AUTH[@]}" $API/providers/rules

# 查实时连接（按 source IP / 域名 / 命中规则）
curl -s "${AUTH[@]}" $API/connections | python3 -c \
  'import json,sys; d=json.load(sys.stdin); [print(c["metadata"]["sourceIP"], "->", c["metadata"].get("host") or c["metadata"]["destinationIP"], "|", c["chains"]) for c in d["connections"]]'

# 手动切换分组的活跃节点（用 Web UI 同等效果）
curl -X PUT "${AUTH[@]}" -d '{"name":"<节点全名>"}' $API/proxies/PROXY
```

Web UI：`http://192.168.100.29:9090/ui/`（用 secret 登录）。

### 5.4 回滚

```bash
# 列备份
sudo ls -la /etc/mihomo/config.yaml.bak.*
# 回滚到指定备份
sudo cp /etc/mihomo/config.yaml.bak.<timestamp> /etc/mihomo/config.yaml
sudo /usr/local/bin/mihomo -t -d /etc/mihomo && sudo systemctl reload mihomo
```

## 6. 已知风险与对策

### 6.1 `wlp0s20f3` 是唯一上行 → 单点故障

- `eno1` 网线一直没接（NO-CARRIER），所有流量靠 Wi-Fi
- 一旦 Wi-Fi 断开或重连失败（如 `systemctl restart mihomo` 触发 TUN 重建时偶发）：NUC 整体失联，LAN 内所有走 NUC 代理的设备同时断网
- 对策：手边备好键鼠 + 显示器；或拉一根网线到 `eno1` 做兜底

### 6.2 与 k3s pod 网络共存

- mihomo `tun.route-exclude-address` 必须包含 `10.42.0.0/16`（pod）和 `10.43.0.0/16`（service），否则 TUN 会劫持 k8s 内部流量导致 pod 互通失败
- k3s pod 启停会触发大量 veth/cni0 上下线事件，过去开 `auto-detect-interface: true` 时会被 netlink 误判反复打 `[TUN] default interface changed` warning（参见 [`changes/20260516-nuc-mihomo-routing-overhaul.md`](changes/20260516-nuc-mihomo-routing-overhaul.md) §1）。现在锁死 `interface-name: wlp0s20f3` 已治理

### 6.3 节点 IP 段被服务方风控

- yiy 订阅里部分节点是 IDC 香港段，被 Apple `idmsa.apple.com` 拒登（症状：主页图片能加载，但登录"连接异常"）
- 对策：Apple 流量走 `APPLE-HK-HOME` 组（filter 限定 HKT 家宽 IP 段）
- 同类问题如果出现在其他服务（Netflix DRM / Disney+ / ChatGPT 风控），按相同套路新建 filter 组

### 6.4 节点 DNS 不稳 → UDP/QUIC 请求 5 秒超时

- fake-ip 模式下，海外域名的真实 IP 解析发生在代理出口的 fallback DoH（1.1.1.1 / dns.google），出口节点网络差时常见 `context deadline exceeded`
- 影响：YouTube / PSN / Apple Push 等 UDP/QUIC 服务卡顿
- 对策：换更稳的节点，或在 `dns.fallback` 里追加 plain DNS（`tls://8.8.8.8:853`）减少 DoH 依赖

## 7. 与其他文档关系

- 节点物理位置 / SSH：[`infra/inventory/hosts.yaml`](inventory/hosts.yaml)
- 跨地域代理（gz/sg 业务侧）：[`infra/06-跨地域代理网关架构.md`](06-跨地域代理网关架构.md) — **与本文档独立，不要混淆**
- 历次变更：`infra/changes/` 下以 `*-nuc-mihomo-*` 命名
