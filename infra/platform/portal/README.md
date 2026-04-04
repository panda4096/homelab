# Public Portal

当前门户用于替代 `Authelia` 登录后的默认 `authenticated` 页面。

现阶段约束：

- 只维护一个入口卡片：`Grafana`
- 当前仍使用公网 IP
- 统一通过 `Authelia ForwardAuth` 保护
- 当前作为 `Authelia` 登录成功后的默认回跳页

相关资产：

- `infra/platform/portal/namespace.yaml`
- `infra/platform/portal/portal-configmap.yaml`
- `infra/platform/portal/portal-deployment.yaml`
- `infra/platform/portal/portal-service.yaml`
- `infra/platform/portal/portal-forwardauth-middleware.yaml`
- `infra/platform/portal/portal-httproute.yaml`
- `infra/platform/portal/portal-networkpolicy.yaml`

## 当前访问方式

- 未登录访问 `https://106.55.163.135/`：先跳 `Authelia`
- 登录成功后：默认回到 `https://106.55.163.135/`
- 从门户点击 `Grafana`：继续沿统一认证链路进入 `/grafana/`

## 验证

```bash
kubectl -n portal get deploy,pod,svc,httproute,networkpolicy,middleware
curl -kI https://106.55.163.135/
```
