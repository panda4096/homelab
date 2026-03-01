# 交给 Codex 的任务（中文）：搭建两节点跨地域 k3s 单集群（gz server + sg agent）+ Kilo，并把过程写入 infra Runbook/变更单

你是 Codex，拥有本仓库写权限 + 远程两台服务器的 SSH 权限（通过 `ssh gz.butcoder.com` 与 `ssh sg.butcoder.com`）。

目标：

1. 在 `gz.butcoder.com` 安装 k3s server（禁用 flannel，准备使用 Kilo 作为 CNI）
2. 部署 Kilo（WireGuard mesh）实现跨节点 PodIP/ClusterIP 互通
3. 在 `sg.butcoder.com` 加入 k3s agent
4. 用 Helm 安装 ingress-nginx（必须固定 chart 版本），并在 runbook 记录 ingress-nginx 2026-03 后无安全更新风险与迁移预案
5. 所有关键步骤必须回写到本仓库的运维文档与变更单，便于后续维护

强要求：

- 全过程按官方文档/官方仓库操作，不要编造不存在的命令或参数
- 任何敏感信息（node-token、kubeconfig 私钥/证书）不要写入 repo

本次执行的 source of truth（先读，后执行）：

- 库存：`infra/inventory/hosts.yaml`
- 版本锁定：`infra/k3s/versions.yaml`
- Runbook：`infra/集群搭建.md`
- 端口清单：`infra/ports.md`
- 变更单模板：`infra/changes/_template.md`

执行规则（必须）：

1. 先创建变更单：从 `infra/changes/_template.md` 复制为 `infra/changes/YYYYMMDD-k3s-kilo-bootstrap.md`
2. 每完成一个关键步骤，把以下信息追加写入变更单与 Runbook（用“摘要”形式）：
   - 做了什么
   - 执行命令（含在哪台机器执行：gz/sg/本地）
   - 关键输出摘要（3-10 行即可）
   - 配置文件路径
3. 失败时不要盲试：先收集 `systemctl/journalctl/kubectl describe/logs`，写清原因再修

建议执行顺序：

## A. Preflight（gz/sg）

- `ssh gz.butcoder.com`、`ssh sg.butcoder.com` 分别采集：
  - OS/内核/磁盘/根分区 rw
  - 安装基础包：curl/ca-certificates/jq/sqlite3
- 把采集命令与摘要输出写入变更单与 `infra/集群搭建.md` 的“安装记录”

## B. 安装 k3s server（gz，自定义 CNI）

- 在 gz 安装 k3s server：
  - `--flannel-backend=none`
  - `--disable-network-policy`
  - `--disable traefik`
  - `--tls-san gz.butcoder.com`
- 记录 k3s 实际版本：`k3s --version`，并回填到 `infra/k3s/versions.yaml` 的 `k3s.version`
- 跨地域（gz/sg 私网不互通）时，确保集群内 `kubernetes.default` 的 Endpoints 指向 `gz` 公网 IP，避免 `sg` 上的 CNI/Kilo 启动闭环：
  - 在 `gz` 写入 `/etc/rancher/k3s/config.yaml`：`advertise-address` + `node-external-ip`（不要设置 `node-ip` 为公网 IP）
  - 重启 `k3s` 并验证：`kubectl -n default get endpoints kubernetes`

## C. 安装 Kilo（CNI + WireGuard）

- 使用本仓库 vendored manifest：`infra/k3s/manifests/kilo-k3s.yaml`
  - 如需重新 vendoring：从 `infra/k3s/versions.yaml` 的 `kilo.manifest_url` 拉取并覆盖 `infra/k3s/manifests/kilo-k3s.yaml`（写清拉取日期）
- `kubectl apply -f infra/k3s/manifests/kilo-k3s.yaml`
- 验证：
  - `kubectl -n kube-system get ds,pods -o wide | grep -i kilo`
  - `kubectl get pods -A -o wide`
- 用 `ss -lunp`/`wg show` 确认 WireGuard 监听端口，更新到 `infra/ports.md`
- 如 Kilo 自动选择了私网 IP 作为 endpoint（跨地域不可达），在两端节点设置：
  - `kilo.squat.ai/force-endpoint=<PUBLIC_IP>:51820`，并重建 Kilo Pod

## D. 加入 sg agent

- 在 gz 读取 node-token（只在终端使用，不写入 repo）
- 在 sg 安装 agent：
  - `K3S_URL=https://gz.butcoder.com:6443`
  - **优先使用** `K3S_TOKEN_FILE=/etc/rancher/k3s/node-token`（避免 token 出现在命令行与 history）
  - `INSTALL_K3S_EXEC="agent"`
- 验证两节点 Ready：`kubectl get nodes -o wide`

## E. Label 节点

- `kubectl label node ... region=gz/sg --overwrite`
- 在 Runbook 写调度示例（nodeSelector）

## F. 跨节点连通性测试（必须）

- 创建一个固定在 sg 的 http 服务（Deployment + ClusterIP Service）
- 在 gz 起 debug pod 去 curl：
  - Service ClusterIP
  - 对端 PodIP
- 把关键命令与成功输出摘要写入变更单
- 若在节点上 `curl` 可通，但在 Pod 里 `curl` 超时，优先检查 `gz` 的 `iptables FORWARD` 策略是否为 `ACCEPT`（Docker 可能会改成 `DROP`）

## G. 安装 ingress-nginx（Helm，必须固定 chart version）

- 安装/验证 helm
- `helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx && helm repo update`
- `helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx -n ingress-nginx -f infra/k3s/values/ingress-nginx.yaml --version <PINNED>`
- 回填 `infra/k3s/versions.yaml` 的 `ingress.chart.version`
- 在 `infra/集群搭建.md` 写清：
  - ingress-nginx 维护到 2026-03 的风险
  - 版本锁定策略
  - 迁移预案（Traefik / NGINX Inc / Gateway API）

## H. 备份脚本演练（至少跑通一次）

- 复制 `infra/k3s/scripts/k3s-backup.sh` 到 gz 并执行一次
- 确认产物包含 `db/` 与 `token`（不要把 token 内容写进 repo）

交付要求（写入变更单与 Runbook）：

- `kubectl get nodes -o wide`
- `kubectl get pods -A -o wide`（核心组件 + kilo + ingress-nginx）
- 跨节点 PodIP/ClusterIP 测试的命令与结果摘要
- `infra/ports.md` 中的端口清单已补齐（含实测 UDP 端口）
