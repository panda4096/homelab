# infra（Source of Truth）

本目录用于长期维护 homelab 的基础设施信息与运维文档：节点清单、版本锁定、manifest/values、端口清单、变更单、Runbook。

> 约定：**敏感信息不入库**（node-token、kubeconfig 私钥/证书等），文档只写占位符（如 `<NODE_TOKEN>`）。

## 节点与入口

| 节点 | 角色 | region label | SSH |
|---|---|---|---|
| gz.butcoder.com | k3s server（控制面） | `region=gz` | `ssh gz.butcoder.com` |
| sg.butcoder.com | k3s agent（工作节点） | `region=sg` | `ssh sg.butcoder.com` |

- k3s API Endpoint（默认）：`https://gz.butcoder.com:6443`

## 文档阅读顺序

- `01` 节点互联与网络架构：`infra/01-节点互联与网络架构.md`
- `02` 集群搭建 Runbook：`infra/02-集群搭建.md`
- `03` 端口与安全组：`infra/03-端口与安全组.md`

> 说明：这里是“阅读/理解顺序”，不是“实际部署时间顺序”。实际创建顺序见 `infra/01-节点互联与网络架构.md` 开头的说明。

## 文档与配置入口

- Runbook（SOP）：`infra/02-集群搭建.md`
- 网络架构：`infra/01-节点互联与网络架构.md`
- 节点库存（主数据）：`infra/inventory/hosts.yaml`
- 版本锁定（主数据）：`infra/k3s/versions.yaml`
- 平台层说明：`infra/platform/README.md`
- kubeconfig（本地私密文件，gitignore）：`infra/.secrets/homelab-k3s.yaml`（刷新：`bash infra/k3s/scripts/fetch-kubeconfig.sh`）
- Kilo CRDs（vendored）：`infra/k3s/manifests/kilo-crds.yaml`
- Kilo（vendored manifest）：`infra/k3s/manifests/kilo-k3s.yaml`
- Kilo tag 说明：使用 `0.6.0`（无 `v` 前缀）
- ingress-nginx（Helm values）：`infra/platform/ingress-nginx/values.yaml`
- ingress-nginx chart（vendored）：`infra/platform/ingress-nginx/charts/ingress-nginx-4.14.3.tgz`
- ingress-nginx 目录说明：`infra/platform/ingress-nginx/README.md`
- 应用层占位：`infra/apps/README.md`
- 端口/安全组清单：`infra/03-端口与安全组.md`
- 变更记录（每次必写）：`infra/changes/`
- Codex 执行 Prompt（可复制）：`infra/prompts/k3s-kilo-2node-codex.md`
- 备份脚本（需要复制到 master 执行）：`infra/k3s/scripts/k3s-backup.sh`

## 目录职责约定

- `infra/k3s/`：集群引导层，只放 k3s 自身、Kilo、kubeconfig 拉取、备份脚本等“让集群先活起来”的资产。
- `infra/platform/`：平台层，放 ingress、监控、日志、证书、网关等公共基础设施。
- `infra/apps/`：业务层，放具体应用的 manifest、Helm values、部署/回滚说明。

## 变更工作流（手工可审计）

1. 从 `infra/changes/_template.md` 复制一份变更单（`infra/changes/YYYYMMDD-<topic>.md`）
2. 只在 repo 里改声明文件（如 `infra/k3s/versions.yaml`、`infra/k3s/manifests/*`、`infra/k3s/scripts/*`、`infra/platform/**/*`、`infra/apps/**/*`）
3. 执行 `kubectl apply` / `helm upgrade --install`（命令与结果写入变更单；不写敏感信息）
4. 验证（nodes/pods/跨节点连通）并回写 Runbook 的摘要
