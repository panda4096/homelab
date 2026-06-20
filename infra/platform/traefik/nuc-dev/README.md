# NUC k3s Traefik —— 启用 Gateway API

家里 NUC 的独立 k3s（`region=home`，不在主集群）默认 Traefik 只开了
`kubernetesIngress` / `kubernetesCRD`。为了让 NUC 与主集群（gz）的入口形态一致
（都走 Gateway API + HTTPRoute，按路径区分），在 NUC 上启用 `kubernetesGateway` provider。

与主集群（`infra/platform/traefik/values.yaml`）的差异：

- NUC Traefik 是 k3s 自带、用 HelmChart 安装，因此用 **HelmChartConfig**（`helmchartconfig.yaml`）
  合并 values，而不是独立 Helm release。
- NUC web entrypoint 是 **:8000**（k3s 非特权监听，对外经 Service `:80` 映射），所以
  `gateway.yaml` 的 listener 端口是 **8000**（必须匹配 entrypoint），而主集群是 80。
- GatewayClass 名为 `nuc-traefik`（主集群是 `homelab-traefik`）。

## 部署

```bash
# 1. 启用 Gateway provider + 建 GatewayClass(nuc-traefik)。k3s helm-controller 会重部署 Traefik。
kubectl --context nuc apply -f infra/platform/traefik/nuc-dev/helmchartconfig.yaml
kubectl --context nuc -n kube-system rollout status deploy/traefik
kubectl --context nuc get gatewayclass nuc-traefik   # ACCEPTED=True

# 2. 建公共 Gateway(绑定 web entrypoint:8000，对外经 svc :80；按路径区分、不写 hostname)。
kubectl --context nuc apply -f infra/platform/traefik/nuc-dev/gateway.yaml
kubectl --context nuc -n kube-system get gateway nuc-gateway   # PROGRAMMED=True
```

## 访问

NUC Traefik 的 LoadBalancer EXTERNAL-IP 是 `192.168.100.29`（svc `:80` → entrypoint `:8000`）。
应用 HTTPRoute 挂到 `nuc-gateway`（`sectionName: web`）后，按路径访问，例如
finbrain：`http://192.168.100.29/finbrain`。
