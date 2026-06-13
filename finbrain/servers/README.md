# finbrain servers (Go 后端)

P0 地基:`/healthz` + 用户偏好 + 标的 CRUD + 建账模板,goose 迁移,可插拔鉴权,时区固定。
完整路线见 [`../docs/IMPLEMENTATION_PLAN.md`](../docs/IMPLEMENTATION_PLAN.md)。

## 数据库

使用 infra 已部署的 **NUC dev postgres**:`192.168.100.29:30432`
(见 [`../../infra/data/postgresql/nuc-dev/README.md`](../../infra/data/postgresql/nuc-dev/README.md))。不使用本地 docker postgres。

### 首次准备(建库建角色,只需一次)

NUC dev 实例不预建应用库。用管理员创建 `finbrain` 角色 + 库(密码取自共享密钥
`../../infra/.secrets/postgresql.env` 的 `FINBRAIN_DB_PASSWORD`):

```bash
cd finbrain/servers
set -a; source ../../infra/.secrets/postgresql.env; set +a
export PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" FB_PW="$FINBRAIN_DB_PASSWORD"
docker run --rm -i -e PGPASSWORD -e FB_PW postgres:17-alpine \
  psql -h 192.168.100.29 -p 30432 -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
\getenv pw FB_PW
SELECT format('CREATE ROLE finbrain LOGIN PASSWORD %L', :'pw') WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='finbrain')\gexec
SELECT 'CREATE DATABASE finbrain OWNER finbrain' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='finbrain')\gexec
SQL
```

(以上仅用 docker 里的 psql 客户端连 NUC,本机无需装 psql。)

## 运行

`make` 会自动从共享密钥组装 `DATABASE_URL` 并设 `GOTOOLCHAIN=local`:

```bash
cd finbrain/servers
make tidy            # 拉依赖
make migrate         # 建表 + 内置模板
make seed            # dev 种子(标的)
make run             # 启动,监听 :8000
```

验证:

```bash
curl -s localhost:8000/healthz
curl -s localhost:8000/api/preferences
curl -s localhost:8000/api/instruments
curl -s localhost:8000/api/account-templates
curl -s -X PUT localhost:8000/api/preferences -d '{"display_currency":"USD"}'
```

前端在 `../webs`(`npm run dev`,:5173,代理 `/api`→:8000)。

## 结构

```
cmd/finbrain      serve | migrate | seed
internal/config   环境配置 + 时区
internal/store    pgx 连接池 + 查询(P1 起引入 sqlc)
internal/httpapi  chi 路由 + 中间件 + JSON 处理
internal/llm      (占位,P6)
db/migrations     goose 迁移(嵌入二进制)
db/seeds          dev 种子
```

## 约定

- 错误信封 `{ "error": { code, message } }`(PLAN §2.1)。
- 时区:`FINBRAIN_TIMEZONE`(默认 `Asia/Shanghai`),进程级 `time.Local`(PLAN §2.2)。
- 鉴权:dev 放行;`FINBRAIN_ENV=production` + `FINBRAIN_AUTH_HEADER` 时校验反代身份头(PLAN §2.4)。
- Go 工具链:本机 `GOSUMDB=off` 无法自动下载新 toolchain,故 `GOTOOLCHAIN=local`(Makefile 已设),依赖须兼容 Go 1.25.4(goose 固定 v3.24.3)。
- 部署不在范围(PLAN §6)。
```
