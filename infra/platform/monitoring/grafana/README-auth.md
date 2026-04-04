# Grafana 公网认证接入

`Grafana` 当前不是直接做 OIDC 登录，而是作为统一公网认证链路的第一个样例：

- 前置：`Traefik Middleware ForwardAuth`
- 认证：`Authelia`
- 后端：`Grafana auth.proxy`

## 相关资产

- `infra/platform/monitoring/victoria-metrics-k8s-stack/values.yaml`
- `infra/platform/monitoring/grafana/grafana-httproute.yaml`
- `infra/platform/monitoring/grafana/grafana-forwardauth-middleware.yaml`
- `infra/platform/monitoring/grafana/grafana-networkpolicy.yaml`

## 当前行为

- 访问 `/grafana/` 时先经过 `Authelia`
- 登录成功后，`Traefik` 把用户头转给 `Grafana`
- `Grafana` 不再展示本地登录表单
- 退出 `Authelia` 后，再访问 `/grafana/` 会重新被拦回认证入口

## trusted headers

当前写入 `Grafana` 的头有：

- `Remote-User`
- `Remote-Name`
- `Remote-Email`
- `Remote-Groups`

对应的 `Grafana auth.proxy` 配置：

- `header_name = Remote-User`
- `headers = Name:Remote-Name Email:Remote-Email Groups:Remote-Groups`

## 安全边界

`Grafana` 既然改成了 `auth.proxy`，就必须确保不能被其他 Pod 伪造认证头。

当前已经通过：

- `monitoring-grafana-from-traefik-only`

这条 `NetworkPolicy` 限制只有 `traefik` namespace 的 `Traefik` Pod 能访问 `Grafana`。
