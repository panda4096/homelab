# finbrain（自研个人资产管理控制台）

当前 finbrain = console-web 前端 + Go API,源码在仓库根同级的 `MoneySeek/`,用其 Helm chart
（`MoneySeek/deploy/helm/finbrain`）部署到**两套 k3s**(云端 gz 主集群 + 家里 NUC),形态统一:
Gateway API + `/finbrain` 路径、production 登录 + 允许注册、只调度 gz。

- 部署 Runbook(两集群):[`DEPLOY-console.md`](DEPLOY-console.md)
- 云端 values 模板:`MoneySeek/deploy/helm/finbrain/values-prod.yaml.example`(复制为 `values-prod.yaml` 填真值)
- 共享数据库:[`infra/data/postgresql`](../../data/postgresql/)（云端）/ `nuc-dev`（NUC）
- NUC 入口(Gateway API 启用):[`infra/platform/traefik/nuc-dev`](../../platform/traefik/nuc-dev/)

## 访问

- 云端:`https://106.55.163.135/finbrain`
- NUC:`http://192.168.100.29/finbrain`

> 历史:本目录原先放的是旧版 `finbrain ingest-agent`(HSBC/Futu 接入聚合层)的 kustomize 资产,
> 已被当前 console 方案取代并清理。`infra/.secrets/finbrain.env`(Firefly/Ghostfolio token、
> DEEPSEEK_API_KEY)是当时 ingest-agent 用的,如不再需要可一并清理。
