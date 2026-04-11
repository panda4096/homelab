# 私密资料与引导资产

`infra/.secrets` 是当前仓库中用于存放集群凭据、引导材料和私密运行时输入的本地目录。

当前约定如下：

- 这个目录是项目结构的一部分，文档和脚本中统一以这里作为本地默认路径。
- 由于这是私有 homelab 仓库，部分文件会作为运维输入被纳入 git 管理。
- 也有一些文件只是本地生成的引导资产，是否提交需要更谨慎地判断。
- 不要把这个目录中的任何内容视为“可公开传播”的资料。

## 常见文件

- kubeconfig：`infra/.secrets/homelab-k3s.yaml`
- Grafana 管理员凭据：`infra/.secrets/grafana-admin.env`
- Grafana API 凭据：`infra/.secrets/grafana-api.env`
- edge gateway 运行时参数：`infra/.secrets/edge-gateway-values.yaml`

## Authelia 与 Traefik

下面这些文件是当前 `Traefik + Gateway API + Authelia` 认证链路引入的私密资料：

- Authelia 本地引导记录：`infra/.secrets/authelia-bootstrap.env`
  - 仅供运维人员本地参考，不会被线上 `Authelia` 进程直接读取。
  - 主要保存初始账号、明文密码提醒、SMTP 密码、会话密钥、存储密钥等人工维护信息。
- Authelia 本地用户库源文件：`infra/.secrets/authelia-users-database.yml`
  - 这是文件认证后端的本地源数据，保存的是密码哈希而不是明文密码。
  - 线上实际挂载的是 Kubernetes Secret `authelia-users`。
  - 新增用户或修改密码时，应先更新这份文件，再同步到集群中的 `authelia-users` Secret。
- Traefik HTTPS 证书与私钥：
  - `infra/.secrets/traefik-public-ip.crt`
  - `infra/.secrets/traefik-public-ip.key`
  - 这是当前基于公网 IP 的 HTTPS 入口所用的手工证书材料。
  - 它们不是公开受信任 CA 签发的正式证书。

## 密码与 2FA 的边界

当前 `Authelia` 的数据边界是分开的：

- 用户身份数据：
  - 用户名
  - 密码哈希
  - 邮箱
  - 用户组
  - 来源：`infra/.secrets/authelia-users-database.yml`
- 运行时状态：
  - session
  - TOTP / WebAuthn 注册状态
  - 存储位置：Authelia 的本地 SQLite 持久化

这意味着：

- 仅修改 `authelia-bootstrap.env` 不会直接让线上密码生效。
- 仅重启 `Authelia` 也不会把密码“重新从 bootstrap 文件读回来”。
- 密码变更应通过 `authelia-users-database.yml` 维护，并同步到集群中的 `authelia-users` Secret。
- WebAuthn / TOTP 状态与文件用户库分离，不在 `authelia-users-database.yml` 中。

## 运维说明

- 刷新 kubeconfig：
  - `bash infra/k3s/scripts/fetch-kubeconfig.sh`
- 推荐的 shell 环境：

```bash
export KUBECONFIG="$(pwd)/infra/.secrets/homelab-k3s.yaml"
kubectl get nodes -o wide
```

如果需要让新的 `Authelia` 密码立即在线上生效，当前流程应是：

1. 更新 `infra/.secrets/authelia-bootstrap.env` 中的明文记录。
2. 生成新的密码哈希并更新 `infra/.secrets/authelia-users-database.yml`。
3. 将该文件同步到 Kubernetes Secret `authelia-users`。
4. 重启或滚动更新 `authelia` deployment。

## 当前限制

当前基于 IP 的入口下，WebAuthn 不稳定：

- 当前认证入口使用的是 `https://106.55.163.135/...`
- 浏览器的 WebAuthn 依赖有效的 relying party 域名，通常不会接受 IP 作为可信来源
- 当前阶段优先使用 TOTP
- 等后续接入正式域名后，再重新评估 WebAuthn
