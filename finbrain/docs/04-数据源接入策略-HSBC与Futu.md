# 04-数据源接入策略-HSBC 与 Futu

## 信任度分级

| Source | 信任度 | 人工确认 | 说明 |
|---|---|---|---|
| HSBC PDF / 截图 | 低 | 强制 | OCR 易错，所有记录必须 review |
| Futu CSV | 中 | 仅异常 | 正常结构化导出自动通过 |
| Futu OpenAPI | 高 | 默认跳过 | 仅做幂等和异常检测 |

## HSBC

### 证券类

- 支持：
  - 买卖通知
  - 派息通知
- 路径：
  - 上传原始 PDF / 图片
  - OCR / 提取文本
  - normalize
  - 人工确认
  - dispatcher

### 理财类

- 支持：
  - 申购确认
  - 到期通知
- 结果：
  - Firefly 记现金流
  - ingest-agent 维护 `wealth_products`

## Futu

### CSV

- 起步形态
- 使用结构化 CSV + 异常检测
- 适合先快速跑通交易导入

### OpenAPI

- 最终形态
- 通过 OpenD 网关 + CronJob 定时拉取
- CSV 保留为 fallback
