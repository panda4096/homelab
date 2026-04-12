# finbrain ingest-agent

最小可运行骨架，负责：

- 接收统一 `Activity schema`
- 以 `(source, source_ref)` 幂等去重
- 保存 `raw_payload`
- 暴露 review 队列与 dashboard 聚合 API
- 提供 Futu CSV 的最小解析与归一化能力

## 本地运行

```bash
cd finbrain/ingest-agent
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

## 环境变量

- `FINBRAIN_DATABASE_URL`
- `FINBRAIN_BASE_PATH`
- `FINBRAIN_TIMEZONE`
- `FINBRAIN_FIREFLY_BASE_URL`
- `FINBRAIN_GHOSTFOLIO_BASE_URL`
- `FINBRAIN_FIREFLY_TOKEN`
- `FINBRAIN_GHOSTFOLIO_TOKEN`

## 主要接口

- `GET /healthz`
- `POST /api/v1/activities`
- `GET /api/v1/reviews`
- `POST /api/v1/wealth-products`
- `GET /api/v1/dashboard`
- `POST /api/v1/sources/futu-csv/parse`
