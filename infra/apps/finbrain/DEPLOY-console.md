# finbrain 控制台（console-web + Go API）部署 Runbook

> 本文档对应**当前**的 finbrain（自研个人资产管理控制台，源码在仓库根同级的 `MoneySeek/`）。
> 同目录下 `finbrain-*.yaml`（ingest-agent / kustomize）是**旧版 ingest-agent** 的资产，已被本方案取代，保留待清理。

## 形态（两集群一致）

| | 云端主集群（gz） | NUC（家） |
|---|---|---|
| context | `homelab-default` | `nuc` |
| 编排 | MoneySeek Helm chart `deploy/helm/finbrain` | 同一 chart |
| 入口 | Gateway API HTTPRoute,挂 `traefik/public-gateway`(websecure) | HTTPRoute 挂 `kube-system/nuc-gateway`(web),见 `infra/platform/traefik/nuc-dev/` |
| 路径 | `/finbrain`(strip-prefix 中间件;不绑 hostname,按路径区分) | 同 |
| 镜像 | `finbrain-api/web:0.2.0`(web 构建期 `VITE_BASE=/finbrain/`),`pullPolicy=Never`,`docker save`→`ctr import` | 同一镜像 |
| 调度 | `nodeSelector region=gz`(**只 gz,不 sg**) | NUC 单节点 |
| 登录 | `env=production`(鉴权开)+ `allow_registration=true` | 同 |
| DB | `postgresql.data.svc.cluster.local`(`infra/data/postgresql`,gz) | 同 FQDN(`infra/data/postgresql/nuc-dev`) |
| 行情代理 | Yahoo 走 sg 出口 `http://10.0.8.11:11081`(gz GOST→sg sing-box);东财直连 | 家用住宅 IP,全部直连(无需代理) |

> 镜像构建用 `MoneySeek/` 仓库:`docker buildx --builder colima --platform linux/amd64 --provenance=false`,
> web 传 `--build-arg VITE_BASE=/finbrain/`。前端子路径支持在 MoneySeek 分支 `deploy/path-routing`。

## 云端部署

```bash
# 0. 镜像:在 MoneySeek/ 构建 finbrain-api:0.2.0 + finbrain-web:0.2.0(VITE_BASE=/finbrain/),
#    docker save → scp gz.butcoder.com:/tmp/ → ssh gz 'sudo k3s ctr -n k8s.io images import ...'
# 1. 数据库(若未部署):见 infra/data/postgresql/README（apply-secrets + 纯 manifest）。
# 2. 云端 values:用 chart 自带的 MoneySeek/deploy/helm/finbrain/values-prod.yaml.example,
#    复制为 values-prod.yaml 填真值(DB 密码 ← infra/.secrets/postgresql.env;
#    sg 代理凭据 ← infra/.secrets/edge-gateway-values.yaml)。
# 3. 部署:
helm --kube-context homelab-default upgrade --install finbrain \
  MoneySeek/deploy/helm/finbrain -n finbrain --create-namespace \
  -f MoneySeek/deploy/helm/finbrain/values-prod.yaml
```

- DB 密码来自 `infra/.secrets/postgresql.env`（`FINBRAIN_DB_PASSWORD`，init 脚本所建用户）。
- Yahoo 代理凭据来自 `infra/.secrets/edge-gateway-values.yaml`（`http.username/password`，端口 11081）。
- NetworkPolicy 需放行代理端口:`networkPolicy.apiEgressExtraPorts: [11081]`（chart 已支持）。

## NUC 部署

```bash
# 先启用 NUC Gateway API:见 infra/platform/traefik/nuc-dev/README.md
helm --kube-context nuc upgrade --install finbrain \
  /path/to/MoneySeek/deploy/helm/finbrain -n finbrain \
  --set config.env=production --set config.allow_registration=true \
  --set api.image.tag=0.2.0 --set web.image.tag=0.2.0 \
  --set api.image.pullPolicy=Never --set web.image.pullPolicy=Never \
  --set ingress.enabled=false --set web.service.type=ClusterIP \
  --set route.enabled=true --set route.pathPrefix=/finbrain \
  --set route.parentRef.name=nuc-gateway \
  --set route.parentRef.namespace=kube-system \
  --set route.parentRef.sectionName=web
```

- NUC 是住宅 IP,Yahoo 直连可用,**不要**配 sg 代理。
- NUC DB 密码用 chart 默认(已提交的 NUC dev 密码)。

## 已知限制

- **Yahoo 在云端 429**:sg 出口是机房 IP,被 Yahoo 限流(429)。东财基金(国内直连)正常。
  要在云端拿到 Yahoo 实时行情需住宅出口节点（后续）。NUC（家用住宅 IP）不受影响。
- 云端 TLS 证书目前是 IP 证书(CN=106.55.163.135):用 `https://106.55.163.135/finbrain` 干净;
  用域名访问会有证书名不匹配告警,需后续签域名证书。

## 访问

- 云端:`https://106.55.163.135/finbrain`（或任意解析到该 IP 的域名 + 路径 `/finbrain`）。
- NUC:`http://192.168.100.29/finbrain`。

## 数据

NUC 是数据源;云端首发时用 `pg_dump`（NUC 只读）→ 清云端空 schema → restore 到云端 `finbrain` 库,
把账户/数据带过去。之后两边库各自独立演进。
