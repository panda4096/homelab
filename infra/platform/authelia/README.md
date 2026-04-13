# Authelia（入口认证层）

当前入口身份层采用 `Authelia`，定位是：

- 作为 `Traefik + Gateway API` 后面的轻量认证服务
- 作为当前公网 Web 服务的统一前置认证入口
- 第一条样例是 `Grafana` 的 ForwardAuth / trusted-header 登录
- 为 `Ghostfolio` 提供 OpenID Connect Provider
- 暂不承担完整 IAM 门户；后续门户由自定义 Web 提供

当前第一阶段不依赖 DNS，统一通过 `gz` 公网 IP + 路径前缀访问：

- `https://106.55.163.135/`
- `https://106.55.163.135/auth/`
- `https://106.55.163.135/grafana/`

后续有稳定 DNS 后，再切换为独立认证域名。

## 当前实现

- 单实例 `Authelia`
- 文件用户库
- 本地 SQLite 存储
- SMTP 通知后端
- 通过 `Traefik Middleware ForwardAuth` 保护 `Grafana`
- 启用内建 OIDC provider，当前注册 `ghostfolio` client
- 当前默认访问策略：`one_factor`
- 登录成功后的默认回跳页：`https://106.55.163.135/`

## 资产位置

- namespace：`infra/platform/authelia/namespace.yaml`
- values：`infra/platform/authelia/values.yaml`
- chart：`infra/platform/authelia/charts/authelia-0.10.50.tgz`
- secret 同步脚本：`infra/platform/authelia/scripts/apply-secrets.sh`

## 本地敏感文件

以下文件统一放在 `infra/.secrets/`，具体是否提交以仓库当前私密资料管理策略为准：

- `infra/.secrets/authelia-bootstrap.env`
  - 现在同时保存 OIDC HMAC、Ghostfolio client secret 和 OIDC JWK 私钥。
- `infra/.secrets/authelia-users-database.yml`

## 运行时 Secret

- `authelia-secrets`：session/storage/SMTP/OIDC 等核心密钥
- `authelia-users`：文件用户库

## 验证

```bash
kubectl -n authelia get pods,svc,httproute
curl -kI https://106.55.163.135/auth/
curl -ks https://106.55.163.135/auth/.well-known/openid-configuration | jq .issuer
curl -kI https://106.55.163.135/
kubectl -n monitoring get middleware,httproute,networkpolicy | rg grafana
```

## 默认接入定位

后续新增公网 Web 服务时，默认先考虑：

1. 是否应统一挂到 `Traefik public-gateway`
2. 是否应先接 `Authelia ForwardAuth`
3. 后端是否支持 trusted header / auth proxy

总接入规则见：

- `infra/07-公网访问与统一认证链路.md`
