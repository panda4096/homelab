# 变更单：ingress-nginx 切换到 hostNetwork 80/443（2026-03-23）

## 目的 / 范围 / 风险

- 目的：废弃宿主机上的 `nps`，让 ingress-nginx 直接监听节点 `80/443`，后续所有 HTTP/HTTPS 服务统一走 Ingress 入口。
- 范围：
  - 停止 `gz` 上占用 `80/443` 的 `nps`
  - 调整 ingress-nginx 为 `DaemonSet + hostNetwork`
  - 更新端口与运行文档
- 风险：
  - 若任一节点宿主机 `80/443` 已被占用，controller 会启动失败
  - 切换期间原 `NodePort 30635/31372` 入口会失效

## 变更前检查

- [x] 当前 ingress-nginx 为 `Deployment + NodePort`
- [x] `gz` 宿主机 `80/443` 被 `nps` 占用
- [x] `sg` 宿主机 `80/443` 空闲（rollout 后 `vm-0-11-ubuntu` 上的 controller Pod 已成功监听）

## 执行记录

### 1. 检查并停止 `gz` 上的 `nps`

在本地执行：

```bash
ssh gz.butcoder.com 'date; ps -ef | grep -w nps | grep -v grep || true; sudo ss -lntup | egrep "(:80 |:80$|:443 |:443$|:80,|:443,)" || true'
ssh gz.butcoder.com 'sudo pkill -x nps || true; sleep 2; pgrep -a nps || true; sudo ss -lntup | egrep "(:80 |:80$|:443 |:443$|:80,|:443,)" || true'
```

输出摘要：

- `nps` 进程来源：`/home/ubuntu/softwares/nps/nps`
- `gz` 上原先由 `nps` 占用：
  - `*:80`
  - `*:443`
- 停止后 `80/443` 已释放

### 2. 调整 ingress-nginx values

变更文件：

- `infra/platform/ingress-nginx/values.yaml`

关键调整：

- `controller.kind=DaemonSet`
- `controller.containerPort.http=80`
- `controller.containerPort.https=443`
- `controller.hostNetwork=true`
- `controller.dnsPolicy=ClusterFirstWithHostNet`
- `controller.reportNodeInternalIp=true`
- `controller.service.enabled=false`

### 3. 应用 Helm 升级

在本地执行：

```bash
export KUBECONFIG="$(pwd)/infra/.secrets/homelab-k3s.yaml"
scp infra/platform/ingress-nginx/values.yaml gz.butcoder.com:/home/ubuntu/ingress-nginx-values.yaml
ssh gz.butcoder.com 'KUBECONFIG=/etc/rancher/k3s/k3s.yaml helm upgrade --install ingress-nginx /home/ubuntu/ingress-nginx-4.14.3.tgz -n ingress-nginx -f /home/ubuntu/ingress-nginx-values.yaml --wait --timeout 10m'
```

输出摘要：

- `helm version`：`v3.20.0`
- release：`ingress-nginx`
- status：`deployed`
- revision：`3`

### 4. 验证

在本地执行：

```bash
export KUBECONFIG="$(pwd)/infra/.secrets/homelab-k3s.yaml"
kubectl -n ingress-nginx get pods,ds,svc -o wide
kubectl get nodes -o wide
ssh gz.butcoder.com 'sudo ss -lntup | egrep "(:80 |:80$|:443 |:443$|:80,|:443,)" || true'
curl -I --max-time 8 --resolve sg.butcoder.com:80:43.156.60.56 http://sg.butcoder.com
curl -kI --max-time 8 --resolve sg.butcoder.com:443:43.156.60.56 https://sg.butcoder.com
ssh gz.butcoder.com 'curl -I --max-time 8 http://106.55.163.135 -H "Host: gz.butcoder.com" && echo --- && curl -kI --max-time 8 https://106.55.163.135 -H "Host: gz.butcoder.com"'
```

输出摘要：

- `daemonset/ingress-nginx-controller`：`DESIRED=2 CURRENT=2 READY=2`
- 两个 controller Pod 均为 `Running`
  - `vm-8-11-ubuntu`（gz）
  - `vm-0-11-ubuntu`（sg）
- controller 外部 `NodePort` Service 已消失，仅保留 admission `ClusterIP`
- `gz` 上 `ss -lntup` 显示 `nginx` 已直接监听 `0.0.0.0:80` 与 `0.0.0.0:443`
- 实测入口：
  - `http://sg.butcoder.com` → `HTTP/1.1 404 Not Found`
  - `https://sg.butcoder.com` → `HTTP/2 404`
  - `http://106.55.163.135` + `Host: gz.butcoder.com` → `HTTP/1.1 404 Not Found`
  - `https://106.55.163.135` + `Host: gz.butcoder.com` → `HTTP/2 404`

备注：

- 当前返回 `404` 是预期现象，表示 ingress controller 已接管 `80/443`，但还没有匹配到具体业务 Ingress 规则。
- 本机直接解析 `gz.butcoder.com` / `sg.butcoder.com` 会落到 `198.18.1.175/176`，因此对外验证统一使用公网 IP + `Host` 头或 `--resolve` 方式，避免本机私有解析干扰。

## 回滚步骤

如需回滚到 `NodePort`：

1. 恢复 `infra/platform/ingress-nginx/values.yaml` 到上一个版本
2. 将 values 同步到 `gz`
3. 执行：

```bash
scp infra/platform/ingress-nginx/values.yaml gz.butcoder.com:/home/ubuntu/ingress-nginx-values.yaml
ssh gz.butcoder.com 'KUBECONFIG=/etc/rancher/k3s/k3s.yaml helm upgrade --install ingress-nginx /home/ubuntu/ingress-nginx-4.14.3.tgz -n ingress-nginx -f /home/ubuntu/ingress-nginx-values.yaml --wait --timeout 10m'
```

4. 如仍需宿主机 `80/443` 服务，再手工恢复 `nps`
