# Firefly III（账本层）

本目录维护 Firefly III 在当前 homelab 中的部署资产，负责：

- 银行卡 / 现金 / 信用卡负债
- 银行理财现金流
- 信用卡账单导入
- 通过 `Authelia ForwardAuth + remote_user_guard` 接入统一认证

## 资源清单

- `namespace.yaml`
- `firefly-configmap.yaml`
- `firefly-deployment.yaml`
- `firefly-service.yaml`
- `firefly-strip-auth-headers-middleware.yaml`
- `firefly-forwardauth-middleware.yaml`
- `firefly-httproute.yaml`
- `firefly-networkpolicy.yaml`
- `kustomization.yaml`
- `scripts/apply-secrets.sh`
- `scripts/init_accounts.py` / `import_credit_card_statement.py` / `smoke-test.sh`

## 前置依赖

Firefly 不再自带 Postgres，数据库使用共享的 `infra/data/postgresql/`（namespace `data`）。部署前必须：

1. `infra/data/postgresql` 已就绪
2. `firefly` 数据库 + `firefly` 用户已通过 init 脚本创建
3. `infra/.secrets/postgresql.env` 和 `infra/.secrets/firefly.env` 都填了真值

## 首次部署

```bash
# 1. 创建 namespace
kubectl apply -f infra/apps/firefly/namespace.yaml

# 2. 生成 Secret（firefly-app-secrets + firefly-db-credentials）
bash infra/apps/firefly/scripts/apply-secrets.sh

# 3. apply 剩余资源
kubectl apply -k infra/apps/firefly

# 4. 等待就绪
kubectl -n firefly rollout status deploy/firefly
```

## 默认访问地址

- `https://106.55.163.135/firefly/`

## 安全边界

- 入口前强制 `Authelia ForwardAuth`
- 在 Traefik 进入后端前先清空 `Remote-User` / `Remote-Email` / `Remote-Name` / `Remote-Groups`
- `NetworkPolicy` 仅允许 Traefik 访问 Firefly Web Pod
- 数据库侧 NetworkPolicy 在 `infra/data/postgresql/networkpolicy.yaml`，只允许 `firefly` / `ghostfolio` / `finbrain` 三个 namespace 访问 5432

## 账户初始化与账单导入

- 账户初始化脚本：`scripts/init_accounts.py`
- 信用卡账单导入脚本：`scripts/import_credit_card_statement.py`
- 冒烟脚本：`scripts/smoke-test.sh`

## 当前限制

- 当前仍使用路径前缀 `/firefly/`，上线后需要验证 Firefly 的所有绝对链接和重定向是否与 `APP_URL` 一致
