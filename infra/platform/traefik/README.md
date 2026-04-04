# Traefik + Gateway API（平台入口）

当前入口层采用：

- `Traefik`
- `Gateway API`
- `Traefik CRD Middleware`
- `hostPort`
- 仅调度到 `edge.role=ingress` 节点

当前第一阶段不依赖 DNS，统一通过 `gz` 公网 IP + 路径前缀访问：

- `https://106.55.163.135/auth/`
- `https://106.55.163.135/grafana/`

后续有稳定 DNS 后，再把访问面切换为独立域名。

## 资产位置

- values：`infra/platform/traefik/values.yaml`
- chart：`infra/platform/traefik/charts/traefik-39.0.7.tgz`
- Gateway API CRDs：`infra/platform/traefik/gateway-api/standard-install-v1.4.1.yaml`
- namespace：`infra/platform/traefik/namespace.yaml`
- Gateway：`infra/platform/traefik/public-gateway.yaml`
- HTTP->HTTPS redirect：`infra/platform/traefik/http-redirect.yaml`

## 设计约束

- `Traefik` 只承接公网 Web 入口，不承接当前 edge proxy 的 `11080/11081/18388`
- 入口只落在 `gz`
- `80/443` 由 `Traefik` 接管
- `Authelia` 与 `Grafana` 当前走路径前缀，不走独立域名
- `Traefik` 同时启用 `kubernetesGateway` 和 `kubernetesCRD`
  - `Gateway API` 负责路由
  - `Middleware` CRD 负责 `ForwardAuth`

## 部署顺序

1. 安装 Gateway API CRDs
2. 释放旧 `ingress-nginx` 对 `80/443` 的占用
3. 安装 `Traefik`
4. 创建 `public-gateway`
5. 创建 TLS Secret
6. 部署后续 `HTTPRoute`

## 验证

```bash
kubectl get gatewayclass,gateway,httproute -A
kubectl -n traefik get pods,svc
curl -kI --resolve 106.55.163.135:443:106.55.163.135 https://106.55.163.135/
```

## 当前公共认证链路

当前公网认证链路已经固定为：

- `Traefik Gateway/HTTPRoute`
- `Traefik Middleware ForwardAuth`
- `Authelia`

参考总文档：

- `infra/07-公网访问与统一认证链路.md`
