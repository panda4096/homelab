# 2026-05-16 NUC mihomo 软路由分流与降噪改造

- 日期：2026-05-16
- 状态：Done
- 关联文档：[`infra/08-NUC家庭软路由（mihomo）.md`](../08-NUC家庭软路由（mihomo）.md)

## 背景

`nuc` 上的 mihomo Web UI（`http://192.168.100.29:9090/ui/#/logs`）出现大量 `level=warning` 日志；同时 PS5 上的 Apple TV App 登录失败（提示"连接问题"，但主页图片视频能加载）；Switch 还没有针对性策略。

诊断 1 小时内的 warning 分类：

| 类型 | 来源 | 归因 |
|---|---|---|
| `[TUN] default interface changed by monitor, => wlp0s20f3` | 每 1–5 分钟一次，箭头始终指向同一张网卡 | 配置侧：`auto-detect-interface: true` + k3s veth/cni0 频繁触发 netlink 通知 |
| `[UDP] dial PROXY ... can't resolve ip ... context deadline exceeded` | YouTube / googlevideo / ytimg / ggpht / PSN STUN | 节点侧：代理出口的 fallback DoH（1.1.1.1 / dns.google）5 秒超时 |
| `[TCP] dial PROXY ... CS2K.YIYONEX.COM:34532 connect: no route to host` | PS5 → PSN | 节点侧：出口节点 IP:port 死了 |

本次只处理"配置侧"的部分（节点侧需换订阅或单节点排查，不在本次范围）。

## 改动总览

| # | 改动 | 类型 | 应用方式 |
|---|---|---|---|
| 1 | TUN 接口监控噪音治理：`auto-detect-interface: false` + 顶层 `interface-name: wlp0s20f3` | 配置 | restart |
| 2 | 新增 `APPLE-HK-HOME` 组（yiy `filter:"HKT家宽"` → 7 节点）+ Apple 路由规则 | 配置 | reload |
| 3 | 新增 `SWITCH-JP` 组（yiy `filter:"日本"` → 5 节点）+ `GEOSITE,nintendo` 规则 | 配置 | reload |
| 4 | 开启 `sniffer`（TLS SNI / HTTP Host / QUIC） + 引入 3 个 `rule-providers`（reject / apple / gfw） | 配置 | reload |

## 1. TUN 接口监控噪音治理

### 现象

```
[TUN] default interface changed by monitor, => wlp0s20f3   # 每 1–5 分钟一次
```

箭头始终指向同一张网卡（`wlp0s20f3` 是 NUC 唯一上行，`eno1` 为 NO-CARRIER）。说明不是真的换网卡——是 mihomo 的 default interface monitor 被 k3s 网络（cni0 / flannel.1 / 5 个 veth*）的频繁上下线事件触发，每次都重新评估一遍 default route 然后打 warning。

### 改动

```diff
+ interface-name: wlp0s20f3      # 新增顶层
  tun:
    ...
-   auto-detect-interface: true
+   auto-detect-interface: false
```

### 执行

```bash
sudo cp /etc/mihomo/config.yaml /etc/mihomo/config.yaml.bak.20260516-113526
sudo $EDITOR /etc/mihomo/config.yaml
sudo /usr/local/bin/mihomo -t -d /etc/mihomo
sudo systemctl restart mihomo    # TUN 子项改动必须 restart，瞬断 ~3s
```

> 第一次只 `reload` 不够，TUN 模块没重新初始化，11:37 又出了一次 warning。必须 restart。

### 验证

restart 后 2 分钟窗口：

- `[TUN] default interface changed` 出现次数：**0**（修复前每 1–5 分钟一次）
- 其余 warning 全部归类到节点侧（UDP DNS 超时），与本次治理无关

## 2. Apple 路由：APPLE-HK-HOME 走 HKT 家宽

### 现象

PS5 上 Apple TV App：

- 进入慢，主页视频/图片能加载（说明带宽通）
- 账号登录报"连接问题"（说明 `idmsa.apple.com` 等登录端点被拒）

### 归因

- 主页静态资源走 Akamai CDN（`is*-ssl.mzstatic.com` / `*.akadns.net`），对来源 IP 容忍
- 登录端点 `idmsa.apple.com` / `gsa.apple.com` 严查 IP 段，**IDC 香港 IP 直接拒**
- yiy 订阅的默认香港节点（`R3-x BGP静态` 等）落在 IDC 段
- 同时 `AUTO-YIY` 是 `url-test`，每 300s 重测可能切节点，Apple 长 session 跟 IP 绑定，漂移就触发风控

### 改动

新增分组（`filter` 从 yiy 订阅按节点名筛 **HKT 家宽**，共 7 节点：`R1-1` + `R2-1`~`R2-6`）：

```yaml
- name: APPLE-HK-HOME
  type: url-test
  url: http://www.gstatic.com/generate_204
  interval: 600
  tolerance: 100
  use:
    - yiy
  filter: "HKT家宽"
```

新增规则（在 `GEOIP,CN` 之前）：

```yaml
- GEOSITE,apple,APPLE-HK-HOME
```

> 初版还显式列了 `mzstatic / aaplimg / apple-cloudkit / cdn-apple` 4 条 `DOMAIN-SUFFIX` 兜底，引入 §4 的 `RULE-SET,apple,APPLE-HK-HOME` 后这 4 条变成死代码，已删除。

### 关键坑

mihomo `proxies:` 字段只能引用顶层 `proxies:` 段定义的节点，**不能**直接写订阅里的节点名。从订阅筛节点必须用 `use: [<provider>]` + `filter: "<regex>"`。

### 验证

```bash
curl -s -H "Authorization: Bearer $SECRET" $API/proxies/APPLE-HK-HOME
# 应见 7 个 R1-1/R2-* HKT家宽 节点
```

## 3. Switch 路由：SWITCH-JP 走日本

同上套路。yiy 日本节点全部为 `R5-1`~`R5-5`（GMO/KDDI/BGP/IIJ/NTT，均标 `NF` 说明住宅段）。

### 改动

```yaml
- name: SWITCH-JP
  type: url-test
  use: [yiy]
  filter: "日本"
```

规则（在 `GEOIP,CN` 之前）：

```yaml
- GEOSITE,nintendo,SWITCH-JP
- DOMAIN-SUFFIX,nintendo.net,SWITCH-JP   # + 6 条兜底（nintendo.com/.co.jp/.jp/nintendowifi.net/nintendo-europe.com/nintendoswitch.com）
```

> `GEOSITE,nintendo` 在 MetaCubeX/meta-rules-dat 中存在（124 条），test 通过；保留 7 条 DOMAIN-SUFFIX 作为内置数据库缺漏时的兜底。

## 4. Sniffer + Rule-Providers

### Sniffer

弥补 App 自带 DoH（绕过 mihomo DNS）导致的规则失配——大量 App（Apple / Google / 米家系）会忽略系统 DNS 走自己的 DoH，结果 mihomo 只能看到目标 IP，规则全打到 `MATCH/PROXY` 兜底。

```yaml
sniffer:
  enable: true
  force-dns-mapping: true       # 把 fake-ip 反解为真实域名
  parse-pure-ip: true           # 纯 IP 直连也 sniff
  override-destination: true
  sniff:
    HTTP: { ports: [80, 8080-8880] }
    TLS:  { ports: [443, 8443] }
    QUIC: { ports: [443] }
  skip-domain:
    - "+.push.apple.com"        # APNS 长连接不要 sniff
    - "Mijia Cloud"             # 米家 cert pinning
```

### Rule-Providers

[Loyalsoldier/clash-rules](https://github.com/Loyalsoldier/clash-rules) 提供社区维护、每日更新的规则集。

```yaml
rule-providers:
  reject: { type: http, behavior: domain, format: text, url: "...reject.txt", path: ./ruleset/reject.txt, interval: 86400 }
  apple:  { type: http, behavior: domain, format: text, url: "...apple.txt",  path: ./ruleset/apple.txt,  interval: 86400 }
  gfw:    { type: http, behavior: domain, format: text, url: "...gfw.txt",    path: ./ruleset/gfw.txt,    interval: 86400 }
```

URL 模板：`https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/<name>.txt`

### 关键坑

Loyalsoldier 已**全部迁移到 `.txt` 文件**（每行一个域名），**不再提供 `.yaml`**。配置必须：

- `format: text`（不是 `yaml`）
- URL 末尾 `.txt`（不是 `.yaml`）

否则 mihomo 启动时报 `404 Not Found` 拉取失败。

### 规则插入位置

```yaml
rules:
  - RULE-SET,reject,REJECT                # 最优先，广告先拦
  - RULE-SET,apple,APPLE-HK-HOME          # Apple 全家桶（比 GEOSITE,apple 更精）
  # ... 私网直连 / Switch / GEOSITE,apple 兜底 / GEOIP,CN / GEOSITE,cn ...
  - RULE-SET,gfw,PROXY                    # GFW 名单精准走代理（MATCH 之前的兜底）
  - MATCH,PROXY
```

### 验证

```bash
curl -s -H "Authorization: Bearer $SECRET" $API/providers/rules
# reject: count=174107  apple: count=164  gfw: count=4235
ls -la /etc/mihomo/ruleset/
# reject.txt 4.9M  apple.txt 5.4K  gfw.txt 90K
```

## 备份链

按改动顺序，每步前先 `cp config.yaml config.yaml.bak.<reason>.<timestamp>`：

| 备份文件 | 对应回滚点 |
|---|---|
| `config.yaml.bak.20260516-113526` | 改动 1 之前（最早原始版本） |
| `config.yaml.bak.preapple.20260516-115953` | 改动 2 之前 |
| `config.yaml.bak.preswitch.20260516-120505` | 改动 3 之前 |
| `config.yaml.bak.presniff.20260516-121541` | 改动 4 之前 |

## 结果

- TUN 噪音 warning：消除
- Apple TV App 登录路径切换到 HKT 家宽，IP 不再被 idmsa 风控（待用户长期观测确认）
- Switch 走日本节点，eShop / 联机延迟改善（待长期观测）
- Sniffer 与 rule-providers 上线，未来按域名/集合分流不必再手写 DOMAIN-SUFFIX

## 未解决问题（节点侧，本次范围外）

- 部分 yiy 节点 UDP 通道差，YouTube/PSN STUN 仍偶现 `context deadline exceeded`
- yiy 订阅里少数节点完全不通（PSN 报 `no route to host` 的 `CS2K.YIYONEX.COM` 等）

建议后续观察：

1. 长期观察 `APPLE-HK-HOME` 内 7 个 HKT 家宽节点是否仍能稳定登录；若被风控，加 IPLC 落地家宽订阅
2. 评估在 `dns.fallback` 追加 `tls://8.8.8.8:853` plain DNS，减少 DoH 对节点的依赖

## 回滚

```bash
# 回到本次所有改动之前的最早状态
sudo cp /etc/mihomo/config.yaml.bak.20260516-113526 /etc/mihomo/config.yaml
sudo /usr/local/bin/mihomo -t -d /etc/mihomo
sudo systemctl restart mihomo   # 因为含 TUN 改动，必须 restart
```
