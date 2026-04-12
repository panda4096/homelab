# 02-数据模型与统一 Activity Schema

## 统一 Activity Schema

所有 source adapter 都必须先 normalize 到同一个内部模型，dispatcher 不允许关心上游来源。

```json
{
  "source": "hsbc_pdf",
  "source_ref": "HSBC-2026-04-001",
  "broker_account": "HSBC HK",
  "trade_date": "2026-04-10",
  "settle_date": "2026-04-12",
  "type": "BUY",
  "symbol": "0700.HK",
  "quantity": "100",
  "unit_price": "320.50",
  "currency": "HKD",
  "fees": {
    "exchange_levy": "1.25",
    "trading_fee": "2.50",
    "broker_commission": "18.00",
    "other": "0.00"
  },
  "settlement_amount": "32071.75",
  "raw_payload": {},
  "raw_doc_uri": "file:///hsbc_pdf/2026-04-001.pdf",
  "wealth_product_code": null
}
```

## 字段说明（持久化字段）

- `raw_payload`：结构化摘要（OCR 文本、CSV 行字典、OpenAPI JSON 等），JSON 列，不含二进制
- `raw_doc_uri`：原始凭证相对路径，格式 `file:///<source>/<hash>.<ext>`，根目录由 `FINBRAIN_UPLOADS_DIR` 决定（部署中为 `/var/finbrain/uploads`，local-path PVC 挂载）。`raw_doc_uri` 和 `raw_payload` 分工明确：二进制 / 原件走 PVC，结构化摘要走 JSON 列。nullable，source 无二进制（例如 Futu OpenAPI）时留空
- `wealth_product_code`：可选，理财申购 / 到期 / 派息活动填对应 `WealthProduct.product_code`。应用层不建 FK（避免活动在产品注册前到达时被 FK 拒绝），Phase 3c 的 dashboard 聚合按这个字段 JOIN。`(source, source_ref)` 仍是唯一的去重主键
- `review_required`：是否进人工审核队列，字段存在是为了让上层显式覆盖，空值表示"按 source 信任度决定"

## 不变量

- 去重主键固定为 `(source, source_ref)`
- `raw_payload` 必须完整留存
- 二进制原件（PDF / 图片 / 原始 CSV）必须写到 `FINBRAIN_UPLOADS_DIR`，并把相对路径填入 `raw_doc_uri`；不允许把二进制塞进 `raw_payload`
- 所有金额字段保持原币种，不在 ingest 层做硬编码换汇
- OCR / CSV / API 只允许影响 `review_required` 策略，不允许改写统一 schema

## 领域对象

### wealth_products

- `product_code`
- `name`
- `issuer`
- `currency`
- `principal`
- `start_date`
- `maturity_date`
- `expected_yield`
- `actual_yield`
- `type`
- `underlying`
- `is_principal_protected`
- `status`

### 活动 ↔ 产品关联

理财相关的活动（申购、到期、派息、部分赎回）必须在 `ActivityRecord.wealth_product_code` 里填对应 `WealthProduct.product_code`。应用层刻意不建数据库外键约束，原因：

- 活动经常先于产品注册到达（例如从银行 PDF 解析出来时对应产品还没手工录入 `wealth_products`）
- 去重主键固定是 `(source, source_ref)`，活动即使没有找到产品也应当先落库、进审核队列，后续补齐 `wealth_product_code`
- Phase 3c 的 dashboard 按产品聚合时用 `wealth_product_code` JOIN 即可；仍然缺失的活动会作为"未关联"呈现在审核队列里

## 分发规则

- `BUY` / `SELL` / `FEE`
  - 写入 Ghostfolio
- `DIVIDEND`
  - 写入 Ghostfolio
  - 现金入账写入 Firefly
- 理财申购 / 到期
  - 写入 Firefly
  - 更新 `wealth_products`
- `INTEREST`
  - 默认不发往 Ghostfolio
  - 仅在 Phase 3c 对明确纳入收益跟踪的固收类产品启用
