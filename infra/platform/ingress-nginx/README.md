# ingress-nginx（平台层组件）

ingress-nginx 属于 **集群搭建完成后的平台组件**，不再放在 `infra/k3s/`。

## 资产位置

- values：`infra/platform/ingress-nginx/values.yaml`
- vendored chart：`infra/platform/ingress-nginx/charts/ingress-nginx-4.14.3.tgz`
- 版本锁定：`infra/k3s/versions.yaml` 的 `ingress.*`

## 当前暴露方式

- 当前采用 `DaemonSet + hostNetwork`
- 每个节点直接监听宿主机端口：
  - HTTP：`80`
  - HTTPS：`443`
- 访问方式：
  - `http://gz.butcoder.com`
  - `https://gz.butcoder.com`
  - `http://sg.butcoder.com`
  - `https://sg.butcoder.com`

> 前提：节点宿主机的 `80/443` 必须空闲；如果已有宿主机进程占用，ingress controller 会因端口冲突启动失败。

## 为什么放在 `platform/`

- 它依赖一个已可用的 Kubernetes 集群。
- 它不是引导 k3s server/agent、Kilo、备份恢复所必需的最小集合。
- 后续监控、日志、证书、网关等组件应和它放在同一层维护。

## 当前锁定版本

- chart：`4.14.3`
- app：`1.14.3`
- 来源：ingress-nginx 官方发布（GitHub Releases）
- 参考 URL：`https://github.com/kubernetes/ingress-nginx/releases/download/helm-chart-4.14.3/ingress-nginx-4.14.3.tgz`
- SHA256：`9c97600b234c70ceffb9adce5c66a6e97e69e2706499bb0308215db4a310769f`

## 使用方式

```bash
kubectl create namespace ingress-nginx --dry-run=client -o yaml | kubectl apply -f -
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  -n ingress-nginx \
  -f infra/platform/ingress-nginx/values.yaml \
  --version 4.14.3
```

## 当前关键配置

- `controller.kind=DaemonSet`
- `controller.containerPort.http=80`
- `controller.containerPort.https=443`
- `controller.hostNetwork=true`
- `controller.dnsPolicy=ClusterFirstWithHostNet`
- `controller.reportNodeInternalIp=true`
- `controller.service.enabled=false`

这样做的结果是：

- ingress controller 不再依赖 `NodePort`
- 每个节点本机直接提供 `80/443`
- 后续 HTTP/HTTPS 服务都统一通过 Ingress 路由
- `80/443` 直接体现在 repo 配置里，不依赖 chart 默认值做隐式约定

当 master 无法访问 chart 下载地址时：

```bash
scp infra/platform/ingress-nginx/charts/ingress-nginx-4.14.3.tgz gz.butcoder.com:/home/ubuntu/ingress-nginx-4.14.3.tgz
scp infra/platform/ingress-nginx/values.yaml gz.butcoder.com:/home/ubuntu/ingress-nginx-values.yaml
ssh gz.butcoder.com "KUBECONFIG=/etc/rancher/k3s/k3s.yaml helm upgrade --install ingress-nginx /home/ubuntu/ingress-nginx-4.14.3.tgz -n ingress-nginx -f /home/ubuntu/ingress-nginx-values.yaml --wait --timeout 10m"
```
