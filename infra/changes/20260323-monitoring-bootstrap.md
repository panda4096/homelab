# 变更单：部署 VictoriaMetrics 监控栈（2026-03-23）

- 状态：Done
- 关联文档：`infra/04-监控平台.md`
- 版本锁定：`infra/k3s/versions.yaml`

## 1. 目的与范围

- 目的：在现有两节点 k3s 集群中部署 `VictoriaMetrics + vmagent + Grafana + kube-state-metrics + node-exporter + vmalert + Alertmanager`
- 访问策略：`ClusterIP` only，不使用 Ingress，不对公网暴露
- 范围：仅部署 metrics / dashboard / alerting 基础组件，不包含 blackbox 或节点间网络探测

## 2. 变更内容（repo 资产）

- 文档：`infra/04-监控平台.md`
- 平台入口：`infra/platform/monitoring/README.md`
- values：`infra/platform/monitoring/victoria-metrics-k8s-stack/values.yaml`
- vendored chart：`infra/platform/monitoring/charts/victoria-metrics-k8s-stack-0.72.5.tgz`
- 本地私密凭据：`infra/.secrets/grafana-admin.env`

## 3. 执行记录

### 3.1 创建本地 Grafana 凭据与集群 Secret

- 本地私密文件：`infra/.secrets/grafana-admin.env`
- 创建命令（密码原文未入库）：

```bash
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
kubectl -n monitoring create secret generic grafana-admin \
  --from-literal=admin-user='<admin-user>' \
  --from-literal=admin-password='<admin-password>' \
  --dry-run=client -o yaml | kubectl apply -f -
```

- 结果：
  - `namespace/monitoring configured`
  - `secret/grafana-admin configured`

### 3.2 Helm 安装 / 升级

- 本地维护资产：
  - chart：`infra/platform/monitoring/charts/victoria-metrics-k8s-stack-0.72.5.tgz`
  - values：`infra/platform/monitoring/victoria-metrics-k8s-stack/values.yaml`
- 同步到 `gz`：

```bash
scp infra/platform/monitoring/charts/victoria-metrics-k8s-stack-0.72.5.tgz \
  gz.butcoder.com:/home/ubuntu/victoria-metrics-k8s-stack-0.72.5.tgz
scp infra/platform/monitoring/victoria-metrics-k8s-stack/values.yaml \
  gz.butcoder.com:/home/ubuntu/monitoring-values.yaml
```

- 首次安装：

```bash
ssh gz.butcoder.com \
  'KUBECONFIG=/etc/rancher/k3s/k3s.yaml helm upgrade --install monitoring \
    /home/ubuntu/victoria-metrics-k8s-stack-0.72.5.tgz \
    -n monitoring \
    -f /home/ubuntu/monitoring-values.yaml \
    --create-namespace \
    --wait \
    --timeout 15m'
```

- 首次安装遇到的问题：
  - `docker.io` / `registry.k8s.io` / `quay.io` 镜像拉取失败
  - `helm` revision `1` 最终 `failed: context deadline exceeded`
- 临时处理：

```bash
export HTTPS_PROXY=http://127.0.0.1:7890
export HTTP_PROXY=http://127.0.0.1:7890
export ALL_PROXY=socks5://127.0.0.1:7890

/tmp/bin/crane pull --platform linux/amd64 docker.io/grafana/grafana:12.4.1 /tmp/monitoring-image-archives/docker.io_grafana_grafana_12.4.1.tar
/tmp/bin/crane pull --platform linux/amd64 registry.k8s.io/kube-state-metrics/kube-state-metrics:v2.18.0 /tmp/monitoring-image-archives/registry.k8s.io_kube-state-metrics_kube-state-metrics_v2.18.0.tar
/tmp/bin/crane pull --platform linux/amd64 victoriametrics/victoria-metrics:v1.138.0 /tmp/monitoring-image-archives/victoriametrics_victoria-metrics_v1.138.0.tar
/tmp/bin/crane pull --platform linux/amd64 victoriametrics/vmagent:v1.138.0 /tmp/monitoring-image-archives/victoriametrics_vmagent_v1.138.0.tar
/tmp/bin/crane pull --platform linux/amd64 victoriametrics/vmalert:v1.138.0 /tmp/monitoring-image-archives/victoriametrics_vmalert_v1.138.0.tar
/tmp/bin/crane pull --platform linux/amd64 victoriametrics/operator:config-reloader-v0.68.3 /tmp/monitoring-image-archives/victoriametrics_operator_config-reloader-v0.68.3.tar
/tmp/bin/crane pull --platform linux/amd64 quay.io/kiwigrid/k8s-sidecar:2.5.0 /tmp/monitoring-image-archives/quay.io_kiwigrid_k8s-sidecar_2.5.0.tar
/tmp/bin/crane pull --platform linux/amd64 prom/alertmanager:v0.28.1 /tmp/monitoring-image-archives/prom_alertmanager_v0.28.1.tar
/tmp/bin/crane pull --platform linux/amd64 docker.io/library/busybox:1.37.0 /tmp/monitoring-image-archives/docker.io_library_busybox_1.37.0.tar

scp /tmp/monitoring-image-archives/*.tar gz.butcoder.com:/home/ubuntu/monitoring-image-archives/
ssh gz.butcoder.com 'for tar in /home/ubuntu/monitoring-image-archives/*.tar; do sudo k3s ctr -n k8s.io images import "$tar"; done'
```

- 重新执行 Helm：

```bash
ssh gz.butcoder.com \
  'KUBECONFIG=/etc/rancher/k3s/k3s.yaml helm upgrade --install monitoring \
    /home/ubuntu/victoria-metrics-k8s-stack-0.72.5.tgz \
    -n monitoring \
    -f /home/ubuntu/monitoring-values.yaml \
    --wait \
    --timeout 15m'
```

- 结果：
  - `helm history monitoring -n monitoring`：
    - `revision 1`: `failed`
    - `revision 2`: `deployed`

### 3.3 验证

- Pod / workload：

```bash
kubectl get deploy,statefulset -n monitoring
kubectl get pods -n monitoring -o wide
```

- 结果摘要：
  - `monitoring-grafana`、`monitoring-kube-state-metrics`、`monitoring-victoria-metrics-operator`、`vmagent-monitoring`、`vmalert-monitoring`、`vmsingle-monitoring` 均 `1/1`
  - `vmalertmanager-monitoring` 为 `1/1`
  - `monitoring-prometheus-node-exporter` 在 `gz` / `sg` 两节点均 `Running`

- Service / PVC：

```bash
kubectl get svc,ingress,pvc -n monitoring
```

- 结果摘要：
  - 所有 Service 均为 `ClusterIP`
  - `monitoring-grafana` PVC：`2Gi Bound`
  - `vmsingle-monitoring` PVC：`20Gi Bound`
  - 无 Ingress / NodePort / LoadBalancer

- MetricsQL / PromQL 验证：

```bash
kubectl -n monitoring port-forward svc/vmsingle-monitoring 8428:8428
curl --get 'http://127.0.0.1:8428/prometheus/api/v1/query' --data-urlencode 'query=up'
curl --get 'http://127.0.0.1:8428/prometheus/api/v1/query' --data-urlencode 'query=kube_node_info'
curl --get 'http://127.0.0.1:8428/prometheus/api/v1/query' --data-urlencode 'query=kube_pod_info'
curl --get 'http://127.0.0.1:8428/prometheus/api/v1/query' --data-urlencode 'query=node_cpu_seconds_total'
curl --get 'http://127.0.0.1:8428/prometheus/api/v1/query' --data-urlencode 'query=node_memory_MemAvailable_bytes'
```

- 结果摘要：
  - `up`：`19`
  - `kube_node_info`：`2`
  - `kube_pod_info`：`16`
  - `node_cpu_seconds_total`：`48`
  - `node_memory_MemAvailable_bytes`：`2`

- Grafana 验证：

```bash
kubectl -n monitoring port-forward svc/monitoring-grafana 3000:80
curl http://127.0.0.1:3000/api/health
curl -u "$GRAFANA_ADMIN_USER:$GRAFANA_ADMIN_PASSWORD" http://127.0.0.1:3000/api/datasources
curl -u "$GRAFANA_ADMIN_USER:$GRAFANA_ADMIN_PASSWORD" 'http://127.0.0.1:3000/api/search?type=dash-db'
```

- 结果摘要：
  - `/api/health`：`database=ok`
  - datasource：`Alertmanager`、`VictoriaMetrics`、`VictoriaMetrics (DS)`
  - dashboards：`14`

## 4. 验收项

- [x] `monitoring` namespace 存在
- [x] 核心 Pod Running
- [x] `node-exporter` 两节点 Running
- [x] 核心服务全部为 `ClusterIP`
- [x] `vmsingle` / `grafana` PVC 已 Bound
- [x] Grafana 可通过 `port-forward` 打开并登录
- [x] MetricsQL 查询 `up` / `kube_node_info` / `kube_pod_info` 有结果
- [x] `vmalert` / `alertmanager` 正常

## 5. 回滚

- Helm：

```bash
ssh gz.butcoder.com 'KUBECONFIG=/etc/rancher/k3s/k3s.yaml helm rollback monitoring 1 -n monitoring'
```

- 彻底卸载：

```bash
ssh gz.butcoder.com 'KUBECONFIG=/etc/rancher/k3s/k3s.yaml helm uninstall monitoring -n monitoring'
kubectl delete namespace monitoring
```
