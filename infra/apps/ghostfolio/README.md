# Ghostfolio（证券投资层）

本目录维护 Ghostfolio 在当前 homelab 中的部署资产，负责：

- 汇丰 / 富途双券商账户
- 港美股持仓与收益分析
- 通过 `Authelia ForwardAuth` 统一保护公网入口
- 通过 `Authelia OIDC Provider` 提供 Ghostfolio 原生 SSO 登录
- 保留 Ghostfolio 本地管理员账号与 Bearer Token 供导入使用

## 部署模式

- 默认使用官方镜像 + 自维护 Kubernetes manifests
- 不把社区 Helm chart 作为生产关键依赖
- `/ghostfolio/` 根入口默认直跳 Ghostfolio 的 OIDC 登录流，并在成功后回到 `/ghostfolio/en/home`

## 默认访问地址

- `https://106.55.163.135/ghostfolio/`

## 资源清单

- `namespace.yaml`
- `redis-deployment.yaml` / `redis-service.yaml`（留在本目录，下一单会迁到 `infra/data/redis/`）
- `ghostfolio-configmap.yaml`
- `ghostfolio-deployment.yaml`
- `ghostfolio-service.yaml`
- `ghostfolio-forwardauth-middleware.yaml`
- `ghostfolio-httproute.yaml`
- `ghostfolio-networkpolicy.yaml`
- `kustomization.yaml`
- `scripts/apply-secrets.sh`
- `scripts/init_accounts.py` / `import_activities.py` / `smoke-test.sh`

## 前置依赖

Ghostfolio 不再自带 Postgres，数据库使用共享的 `infra/data/postgresql/`（namespace `data`）。部署前必须：

1. `infra/data/postgresql` 已就绪
2. `ghostfolio` 数据库 + `ghostfolio` 用户已通过 init 脚本创建
3. `infra/.secrets/postgresql.env` 和 `infra/.secrets/ghostfolio.env` 都填了真值
4. `infra/platform/authelia` 已启用 OIDC provider，并已运行 `scripts/apply-secrets.sh` 同步 `authelia-secrets`

Redis 继续用 ghostfolio 自己 namespace 内部署的那一份（`redis-deployment.yaml`），和 Ghostfolio 的缓存生命周期绑定；未来迁到 `infra/data/redis/` 时再拆。

## 首次部署

```bash
# 1. 创建 namespace
kubectl apply -f infra/apps/ghostfolio/namespace.yaml

# 2. 生成 Secret（app / db-credentials / redis）
bash infra/apps/ghostfolio/scripts/apply-secrets.sh

# 3. apply 剩余资源
kubectl apply -k infra/apps/ghostfolio

# 4. 等待就绪
kubectl -n ghostfolio rollout status deploy/ghostfolio
```

## 初始化

- 首次登录在 Ghostfolio UI 中创建管理员用户
- 在应用内生成导入用 token
- 通过 `scripts/init_accounts.py` 校验 `HSBC HK` 与 `Futu HK` 的账户映射
- OIDC 登录按钮依赖 `ENABLE_FEATURE_AUTH_OIDC=true` 和 `OIDC_CLIENT_SECRET` 已注入 `ghostfolio-app-secrets`

## 当前限制

- 当前仍走路径前缀 `/ghostfolio/`
- 根入口 `/ghostfolio/` 会直接重定向到 `/ghostfolio/api/auth/oidc?redirectTo=%2Fen%2Fhome`；欢迎页仍可通过 `/ghostfolio/en/start` 访问
- OIDC callback 走 `/ghostfolio/api/auth/oidc/callback`，依赖 `ROOT_URL` 与 HTTPRoute 的 StripPrefix 行为保持一致
- Redis 单实例，没有持久化保护，重启后 Ghostfolio 内部缓存需要重建（可接受）
