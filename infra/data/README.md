# data（共享持久化数据层）

`infra/data/` 维护当前 homelab 中所有**需要持久化**的后端存储组件。定位是：

- 对外提供数据库 / 缓存 / 检索引擎等持久化服务
- 被 `infra/apps/` 下的无状态业务工作负载直接消费
- 组件之间尽量独立，不共享同一份数据或权限

和其他顶级目录的边界：

- `infra/k3s/` 拉起集群，本目录里的组件建立在其上。
- `infra/platform/` 是公共基础设施（入口、认证、监控），**无状态**为主；有状态的数据层迁出到本目录单独维护。
- `infra/apps/` 只放**无状态**的业务应用工作负载，所有持久化连接都指向本目录下的某个组件。

## 当前组件

- `infra/data/postgresql/`：bitnami/postgresql 共享实例，承载 `firefly` / `ghostfolio` / `finbrain` 三个 database。

## 预留组件

未来同样模式进入本目录、不回到 `infra/apps/` 的组件：

- `infra/data/redis/`：Ghostfolio 当前仍用它自己 namespace 内的 Redis，后续迁出到这里统一维护。
- `infra/data/elasticsearch/`：需要全文检索时引入。

## 维护约定

- 每个组件一个独立子目录，至少包含 `README.md`、`values.yaml`（若为 Helm）、`namespace.yaml` 和连接侧的 NetworkPolicy。
- 优先使用社区 Helm chart 并 vendored 锁定版本到 `charts/<name>-<version>.tgz`，对齐 `infra/platform/traefik/` 和 `infra/platform/authelia/` 已有的模式。
- 真值密码放 `infra/.secrets/<component>.env`，由组件目录下 `scripts/apply-secrets.sh` 同步到集群 Secret。
- 每次变更都先改 repo，再执行 `helm upgrade` / `kubectl apply`，并在 `infra/changes/` 补变更单。

## 共用 namespace

所有组件默认安装到 `data` namespace，除非组件本身要求独占（例如某些 operator）。
