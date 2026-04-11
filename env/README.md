# env/ — Linux 节点装机记录

本目录记录「从一台干净的 Ubuntu 节点到能运维 homelab 集群」所需的本地工具链配置。

## 跟 infra/ 的分工

| 目录 | 管什么 |
|---|---|
| `infra/k3s/versions.yaml` | 集群**服务端**组件版本（k3s、kilo、traefik、monitoring 等） |
| `env/versions.yaml` | 运维机 / dev 机上的**客户端**工具里「必须 pin」的那几项 |
| `env/NN-*.md` | 每类客户端工具的安装、配置、验收步骤 |

`env/` **不是集群部署清单**，那是 `infra/` 的事。这里只管「人手里」的工具链。

## 文件命名与安装顺序

前缀数字表示安装顺序：

- `00-*` 最先装，是后续一切的前置
- `01-*` 在 `00-*` 装完之后装；**同为 `01-` 的文件互不依赖，可任选顺序或并行装**
- `02-*` 在 `01-*` 全部装完之后装（当前还没有）

当前依赖图：

```
00-base
 ├── 01-golang
 └── 01-k8s-client
```

## 版本纪律

- **默认不 pin 版本**。笔记里写「最新稳定版 + 查询命令」，正文不出现具体版本号。
- 只有在跟其他组件有**硬兼容约束**时才 pin（当前只有 kubectl 必须对齐 k3s）。
- pin 的版本集中写到 `versions.yaml`，每项必须包含：
  - `constraint`：为什么 pin、对齐谁
  - `current`：当前装的版本
  - `last_verified`：上次验证的日期
- 笔记正文里跟版本有关的地方一律用 shell 变量（`$KUBECTL_VERSION` / `$GO_VERSION`），不写死。

## 变更流程

跟 `infra/changes/` 同一套：动 `versions.yaml` 之前先抄变更单模板，记录为什么升级、验收命令、回滚办法。

## 已弃用

- 旧 `env/dev.md`：已拆分为 `00-base.md` / `01-golang.md` / `01-k8s-client.md`
- 旧 `env/proxy.md`（第三方 clash 装机笔记）：已删除，当前代理链路见 `infra/platform/edge-gateway/`
- 旧 `net/clash/`：已删除，原因同上
