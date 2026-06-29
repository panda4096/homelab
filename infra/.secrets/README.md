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
- 共享数据层 PostgreSQL 密码：`infra/.secrets/postgresql.env`
- Firefly III 应用层密钥：`infra/.secrets/firefly.env`
- Ghostfolio 应用层密钥：`infra/.secrets/ghostfolio.env`
  - 同时可选保存 Ghostfolio 外网行情请求用的代理变量（例如经 `edge-gateway` 走新加坡 egress）
- finbrain 应用层密钥：`infra/.secrets/finbrain.env`

## Authelia 与 Traefik

下面这些文件是当前 `Traefik + Gateway API + Authelia` 认证链路引入的私密资料：

- Authelia 本地引导记录：`infra/.secrets/authelia-bootstrap.env`
  - 仅供运维人员本地参考，不会被线上 `Authelia` 进程直接读取。
  - 主要保存初始账号、明文密码提醒、SMTP 密码、会话密钥、存储密钥以及 OIDC HMAC / JWK / client secret 等人工维护信息。
- Authelia 本地用户库源文件：`infra/.secrets/authelia-users-database.yml`
  - 这是文件认证后端的本地源数据，保存的是密码哈希而不是明文密码。
  - 线上实际挂载的是 Kubernetes Secret `authelia-users`。
  - 新增用户或修改密码时，应先更新这份文件，再同步到集群中的 `authelia-users` Secret。
- Traefik HTTPS 证书与私钥：
  - `infra/.secrets/traefik-public-ip.crt`
  - `infra/.secrets/traefik-public-ip.key`
  - 这是旧的基于公网 IP 的自签名证书材料，仅作为回滚参考。
  - 当前正式公网入口证书已经进入 Helm release chart：`deploy/traefik-public-gateway/files/`。

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
3. 运行 `bash infra/platform/authelia/scripts/apply-secrets.sh` 同步 `authelia-secrets` 和 `authelia-users`。
4. 重启或滚动更新 `authelia` deployment。

## 数据层 PostgreSQL 与业务应用密码

`infra/.secrets/postgresql.env` 是共享 PostgreSQL 的真值源，包含 admin 密码和三个 app 用户的初始密码：

```
POSTGRES_ADMIN_PASSWORD=...
FIREFLY_DB_PASSWORD=...
GHOSTFOLIO_DB_PASSWORD=...
FINBRAIN_DB_PASSWORD=...
```

这份文件被 **四个** 脚本读取：

- `infra/data/postgresql/scripts/apply-secrets.sh` — 生成 `postgresql-admin` 和 `postgresql-init-scripts` 两个集群 Secret
- `infra/apps/firefly/scripts/apply-secrets.sh` — 组装 firefly-db-credentials
- `infra/apps/ghostfolio/scripts/apply-secrets.sh` — 组装 ghostfolio-db-credentials
- `infra/apps/finbrain/scripts/apply-secrets.sh` — 组装 finbrain-app-secrets 里的 FINBRAIN_DATABASE_URL

app 层另外各自有一份 `<app>.env` 存放非数据库的应用密钥（`APP_KEY` / token / salt 等），和 `postgresql.env` 解耦。

**首次部署顺序**：

1. 填 `postgresql.env`
2. `kubectl apply -f infra/data/postgresql/namespace.yaml`
3. `bash infra/data/postgresql/scripts/apply-secrets.sh`
4. `bash infra/data/postgresql/scripts/helm-install.sh`
5. 然后再对每个 app 填 `<app>.env`、`kubectl apply -f .../namespace.yaml`、`bash .../scripts/apply-secrets.sh`、`kubectl apply -k ...`

**密码轮换**：init 脚本只在 bitnami chart **首次** 启动时执行一次；后续密码变更必须直接 `ALTER USER` 在线改，然后同步到 `postgresql.env` 并重跑对应 app 的 `apply-secrets.sh`。

## 当前限制

当前 Gateway 已接入 `codebear.fun` 证书，但认证与应用层 URL 仍有 IP-first 配置，WebAuthn 不稳定：

- 当前认证入口使用的是 `https://106.55.163.135/...`
- 浏览器的 WebAuthn 依赖有效的 relying party 域名，通常不会接受 IP 作为可信来源
- 当前阶段优先使用 TOTP
- 等后续完成 Authelia / Portal / app URL 域名化后，再重新评估 WebAuthn
