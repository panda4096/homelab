# Public Portal

当前门户用于替代 `Authelia` 登录后的默认 `authenticated` 页面。

现阶段约束：

- 只维护一个入口卡片：`Grafana`
- 当前仍使用公网 IP
- 当前作为 `Authelia` 登录成功后的默认回跳页
- 门户本身保持公开访问，登录和退出按钮直接复用 `Authelia`
- 门户通过前端探测 `Grafana` 受保护健康接口来判断当前 SSO 会话状态

相关资产：

- `infra/platform/portal/namespace.yaml`
- `infra/platform/portal/portal-configmap.yaml`
- `infra/platform/portal/portal-deployment.yaml`
- `infra/platform/portal/portal-service.yaml`
- `infra/platform/portal/portal-httproute.yaml`
- `infra/platform/portal/portal-networkpolicy.yaml`

## 当前访问方式

- 访问 `https://106.55.163.135/`：直接进入门户
- 未登录时：只展示主登录按钮
- 已登录时：主按钮切换为 `进入 Grafana`，右上角展示 `设置/退出`
- 从门户点击 `Grafana`：继续沿统一认证链路进入 `/grafana/`

## 验证

```bash
kubectl -n portal get deploy,pod,svc,httproute,networkpolicy
curl -kI https://106.55.163.135/
```
