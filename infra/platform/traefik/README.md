# Traefik + Gateway API（平台入口）

当前入口层采用：

- `Traefik`
- `Gateway API`
- `Traefik CRD Middleware`
- `hostPort`
- 仅调度到 `edge.role=ingress` 节点

发布边界拆成两层：

- Traefik 控制器：使用 vendored upstream chart + `infra/platform/traefik/values.yaml`
- 公网 Gateway：使用本仓库 Helm chart `deploy/traefik-public-gateway`

当前 Gateway TLS 已接入正式域名证书：

- `codebear.fun`
- `www.codebear.fun`

`codebear.fun` 当前解析到 `gz` 公网 IP。认证与应用层仍有部分 IP-first 配置，完整域名化迁移应单独处理。

## 资产位置

- values：`infra/platform/traefik/values.yaml`
- chart：`infra/platform/traefik/charts/traefik-39.0.7.tgz`
- Gateway API CRDs：`infra/platform/traefik/gateway-api/standard-install-v1.4.1.yaml`
- namespace：`infra/platform/traefik/namespace.yaml`
- 公网 Gateway release：`deploy/traefik-public-gateway`

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
4. 安装公网 Gateway release
   ```bash
   helm upgrade --install traefik-public-gateway deploy/traefik-public-gateway \
     -n traefik \
     --wait --timeout 5m
   ```
5. 部署后续 `HTTPRoute`

公网 Gateway release 维护：

- `Gateway`：`traefik/public-gateway`
- HTTP->HTTPS redirect：`traefik/redirect-to-https`
- TLS Secret：`traefik/public-gateway-tls`
- 正式证书文件：`deploy/traefik-public-gateway/files/public-gateway.crt`
- 正式私钥文件：`deploy/traefik-public-gateway/files/public-gateway.key`

## 验证

```bash
kubectl get gatewayclass,gateway,httproute -A
kubectl -n traefik get pods,svc
curl -I --resolve codebear.fun:443:106.55.163.135 https://codebear.fun/
helm status traefik-public-gateway -n traefik
```

## 当前公共认证链路

当前公网认证链路已经固定为：

- `Traefik Gateway/HTTPRoute`
- `Traefik Middleware ForwardAuth`
- `Authelia`

参考总文档：

- `infra/07-公网访问与统一认证链路.md`
