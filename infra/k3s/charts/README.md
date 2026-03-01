# Helm charts（vendored）

本目录用于存放「已固定版本」的 Helm chart 压缩包（`.tgz`），以应对以下场景：

- 集群节点无法访问 GitHub release assets（`github.com` / `release-assets.githubusercontent.com`）
- 需要在变更评审中对 chart 进行 review / diff / 回滚

> 约定：此目录只放 chart 包与其校验信息，不放任何敏感信息。

## ingress-nginx

- 文件：`infra/k3s/charts/ingress-nginx-4.14.3.tgz`
- 版本：chart `4.14.3`（app `1.14.3`）
- 来源：ingress-nginx 官方发布（GitHub Releases）
  - URL（参考）：`https://github.com/kubernetes/ingress-nginx/releases/download/helm-chart-4.14.3/ingress-nginx-4.14.3.tgz`
- SHA256：`9c97600b234c70ceffb9adce5c66a6e97e69e2706499bb0308215db4a310769f`

### 使用方式（在 master 上执行 Helm）

当 master 无法访问 chart 下载地址时：

```bash
# 从仓库把 chart 复制到 master（gz）
scp infra/k3s/charts/ingress-nginx-4.14.3.tgz gz.butcoder.com:/home/ubuntu/ingress-nginx-4.14.3.tgz

# 使用本地 chart 文件安装/升级（需同时固定 values）
ssh gz.butcoder.com "KUBECONFIG=/etc/rancher/k3s/k3s.yaml helm upgrade --install ingress-nginx /home/ubuntu/ingress-nginx-4.14.3.tgz -n ingress-nginx -f /home/ubuntu/ingress-nginx-values.yaml --wait --timeout 10m"
```
