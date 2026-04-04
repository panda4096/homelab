# Public Portal

当前门户用于替代 `Authelia` 登录后的默认 `authenticated` 页面。

现阶段约束：

- 只维护一个入口卡片：`Grafana`
- 当前仍使用公网 IP
- 当前作为 `Authelia` 登录成功后的默认回跳页
- `/` 是公开 landing，只保留统一登录入口
- `/home/` 是认证后的真实门户，挂 `Authelia ForwardAuth`

相关资产：

- `infra/platform/portal/namespace.yaml`
- `infra/platform/portal/portal-configmap.yaml`
- `infra/platform/portal/portal-deployment.yaml`
- `infra/platform/portal/portal-service.yaml`
- `infra/platform/portal/portal-forwardauth-middleware.yaml`
- `infra/platform/portal/portal-httproute.yaml`
- `infra/platform/portal/portal-networkpolicy.yaml`

## 当前访问方式

- 访问 `https://106.55.163.135/`：进入公开 landing
- 点击“登录认证”：进入 `Authelia`，登录成功后回到 `https://106.55.163.135/home/`
- 访问 `https://106.55.163.135/home/`：如果未登录，会先跳 `Authelia`
- 从认证后的门户点击 `Grafana`：继续沿统一认证链路进入 `/grafana/`

## 验证

```bash
kubectl -n portal get deploy,pod,svc,httproute,networkpolicy,middleware
curl -kI https://106.55.163.135/
curl -kI https://106.55.163.135/home/
```
