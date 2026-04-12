# Finbrain

`finbrain/` 是这套个人财务系统的产品目录，负责承载设计文档、实现代码、测试、样本和阶段性交付物。

## 目标

- 用自部署的开源方案替代一木记账
- 把银行卡、信用卡、港美股、银行理财和多币种现金纳入统一视图
- 降低逐笔手工记账成本，转向“账单导入 + 自动归类 + 例外处理”
- 保留原始凭证、人工确认和幂等导入能力，方便长期审计

## 系统边界

- `Firefly III`
  - 现金、银行卡、信用卡负债、银行理财现金流
- `Ghostfolio`
  - 汇丰 / 富途证券持仓、收益分析、价格抓取
- `ingest-agent`
  - 数据源适配、统一 Activity schema、去重、审计、人工确认、写入分发
- `dashboard`
  - 聚合 Firefly / Ghostfolio / ingest-agent 数据的单页总览

## 认证与访问

- 当前基线沿用仓库里已经落地的 `Traefik + Gateway API + Authelia`
- 默认入口仍使用公网 IP + 路径前缀：
  - `/firefly/`
  - `/ghostfolio/`
  - `/finbrain/`
- 不把 `Authentik` 迁移纳入本阶段实施

## 目录

- `docs/`
  - 架构、数据模型、阶段计划、导入策略、Dashboard、备份恢复
- `ingest-agent/`
  - FastAPI 服务、数据模型、dispatchers、review UI、dashboard、测试

## 交付顺序

- Phase 0：仓库与文档基线
- Phase 1：Firefly III 部署与信用卡账单导入
- Phase 2：Ghostfolio 部署与双券商基线
- Phase 3a：HSBC PDF source + review UI
- Phase 3b：Futu CSV source
- Phase 3c：HSBC 理财 source + wealth_products
- Phase 4：Futu OpenAPI

## 与 infra 的关系

- `finbrain/` 负责产品设计、源码、测试和实现细节
- `infra/apps/{firefly,ghostfolio,finbrain}/` 负责把这些组件接入当前 homelab 集群
- `infra/changes/` 只记录已经执行过的集群变更
