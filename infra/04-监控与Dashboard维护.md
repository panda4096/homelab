# 04-监控与Dashboard维护（VictoriaMetrics，ClusterIP-only）

本阶段目标：先把集群监控基础设施跑起来，让你可以在 Grafana 中看到 **node / pod / workload** 相关指标；不对公网暴露，不走 Ingress。网络探测与底层链路监控已独立到 `infra/05-网络探测与链路监控.md`。

## 1. 架构与范围

- 监控栈：`VictoriaMetrics k8s stack`
- namespace：`monitoring`
- 访问策略：全部 `ClusterIP`
- 查看方式：`kubectl port-forward`
- 第一阶段组件：
  - `victoria-metrics-operator`
  - `vmsingle`
  - `vmagent`
  - `grafana`
  - `kube-state-metrics`
  - `node-exporter`
  - `vmalert`
  - `alertmanager`
- 本文不包含：
  - blackbox exporter / VMProbe
  - ICMP/TCP/HTTP 主动探测
  - WireGuard/Kilo 底层链路监控
  - 任何公网暴露

## 2. 资产位置

- 平台层入口：`infra/platform/monitoring/README.md`
- chart：`infra/platform/monitoring/charts/victoria-metrics-k8s-stack-0.72.5.tgz`
- values：`infra/platform/monitoring/victoria-metrics-k8s-stack/values.yaml`
- 自定义 dashboard：`infra/platform/monitoring/grafana/`
- 版本锁定：`infra/k3s/versions.yaml`
- 变更记录：`infra/changes/20260323-monitoring-bootstrap.md`
- dashboard 托管变更：`infra/changes/20260323-grafana-api-managed-dashboards.md`
- 网络探测文档：`infra/05-网络探测与链路监控.md`
- 本地 Grafana 凭据：`infra/.secrets/grafana-admin.env`
- 本地 Grafana API 凭据：`infra/.secrets/grafana-api.env`

## 3. 调度与资源策略

- 固定到 `gz` 的单点组件：
  - `vmsingle`
  - `vmagent`
  - `grafana`
  - `vmalert`
  - `alertmanager`
  - `kube-state-metrics`
- 全节点组件：
  - `node-exporter`
- 存储：
  - `vmsingle`：`20Gi`，`local-path`
  - `grafana`：`2Gi`，`local-path`
- 指标保留期：`30d`
- 实际部署时间：`2026-03-23`
- Helm release：`monitoring`
- namespace：`monitoring`

## 4. 访问方式（只通过 ClusterIP）

### 4.1 Grafana

先在仓库根目录执行：

```bash
export KUBECONFIG="$(pwd)/infra/.secrets/homelab-k3s.yaml"
source infra/.secrets/grafana-admin.env
```

启动端口转发：

```bash
kubectl -n monitoring port-forward svc/monitoring-grafana 3000:80
```

然后访问：

- `http://127.0.0.1:3000`

Grafana 管理员凭据：

- 集群 Secret：`monitoring/grafana-admin`
- 本地私密文件：`infra/.secrets/grafana-admin.env`
- 登录用户名：`$GRAFANA_ADMIN_USER`
- 登录密码：`$GRAFANA_ADMIN_PASSWORD`

### 4.2 日常使用入口

常用检查：

```bash
kubectl get pods -n monitoring
kubectl get svc -n monitoring
kubectl get pvc -n monitoring
kubectl get vmagent,vmsingle,vmalert,vmalertmanager -n monitoring
```

查看 Grafana：

```bash
export KUBECONFIG="$(pwd)/infra/.secrets/homelab-k3s.yaml"
source infra/.secrets/grafana-admin.env
kubectl -n monitoring port-forward svc/monitoring-grafana 3000:80
```

打开 `http://127.0.0.1:3000`，用环境变量里的账号密码登录。

建议优先看的 dashboard：

- Kubernetes / Compute Resources / Node
- Kubernetes / Compute Resources / Namespace (Pods)
- Kubernetes / Views / Global
- Kubernetes / Views / Nodes
- Kubernetes / Views / Pods

如果 `Kubernetes / Views / Nodes` 里节点 CPU / 内存面板显示 `No data`：

- 先点页面右上角 `Refresh`
- 再重新选择一次 `node`
- 若仍不对，确认 `node_uname_info` 的 `instance` / `nodename` 已是节点名而不是 node-exporter PodIP

排障时看 Grafana / VictoriaMetrics / 告警组件日志：

```bash
kubectl logs -n monitoring deploy/monitoring-grafana
kubectl logs -n monitoring deploy/vmagent-monitoring -c vmagent
kubectl logs -n monitoring deploy/vmsingle-monitoring
kubectl logs -n monitoring deploy/vmalert-monitoring -c vmalert
kubectl logs -n monitoring statefulset/vmalertmanager-monitoring -c alertmanager
```

### 4.3 VictoriaMetrics 单机查询

```bash
kubectl -n monitoring port-forward svc/vmsingle-monitoring 8428:8428
```

查询示例：

```bash
curl -g 'http://127.0.0.1:8428/prometheus/api/v1/query?query=up'
curl -g 'http://127.0.0.1:8428/prometheus/api/v1/query?query=kube_node_info'
curl -g 'http://127.0.0.1:8428/prometheus/api/v1/query?query=kube_pod_info'
```

常用查询：

```bash
curl -g 'http://127.0.0.1:8428/prometheus/api/v1/query?query=up'
curl -g 'http://127.0.0.1:8428/prometheus/api/v1/query?query=kube_node_info'
curl -g 'http://127.0.0.1:8428/prometheus/api/v1/query?query=kube_pod_info'
curl -g 'http://127.0.0.1:8428/prometheus/api/v1/query?query=node_cpu_seconds_total'
curl -g 'http://127.0.0.1:8428/prometheus/api/v1/query?query=node_memory_MemAvailable_bytes'
```

### 4.4 Alertmanager 查看

```bash
kubectl -n monitoring port-forward svc/vmalertmanager-monitoring-additional-service 9093:9093
```

然后访问：

- `http://127.0.0.1:9093`

当前只用于验证告警链路是否正常，未接外部通知渠道。

## 5. Grafana 验收目标

Grafana 登录后，至少应能看到：

- 两个节点的 CPU / 内存 / 磁盘 / 网络指标
- Pod / Namespace / Deployment / DaemonSet / PVC 基础状态
- `up`
- `kube_node_info`
- `kube_pod_info`
- `node_cpu_seconds_total`
- `node_memory_MemAvailable_bytes`

已验证的实际结果：

- `up`：`19` 条序列
- `kube_node_info`：`2` 条序列
- `kube_pod_info`：`16` 条序列
- `node_cpu_seconds_total`：`48` 条序列
- `node_memory_MemAvailable_bytes`：`2` 条序列
- Grafana health：`database=ok`
- Grafana datasources：`Alertmanager`、`VictoriaMetrics`、`VictoriaMetrics (DS)`
- Grafana dashboards：`14` 个

## 6. 告警链路（第一阶段）

- `vmalert` 与 `alertmanager` 一起部署
- 第一阶段只验证链路健康，不接外部通知
- 默认 receiver 使用 `blackhole`

## 7. 升级与变更

所有变更先改 repo，再落集群，不直接在集群里手改。

同步到 `gz`：

```bash
scp infra/platform/monitoring/charts/victoria-metrics-k8s-stack-0.72.5.tgz \
  gz.butcoder.com:/home/ubuntu/victoria-metrics-k8s-stack-0.72.5.tgz
scp infra/platform/monitoring/victoria-metrics-k8s-stack/values.yaml \
  gz.butcoder.com:/home/ubuntu/monitoring-values.yaml
```

执行升级：

```bash
ssh gz.butcoder.com \
  'KUBECONFIG=/etc/rancher/k3s/k3s.yaml helm upgrade --install monitoring \
    /home/ubuntu/victoria-metrics-k8s-stack-0.72.5.tgz \
    -n monitoring \
    -f /home/ubuntu/monitoring-values.yaml \
    --wait \
    --timeout 15m'
```

查看 release：

```bash
ssh gz.butcoder.com 'KUBECONFIG=/etc/rancher/k3s/k3s.yaml helm history monitoring -n monitoring'
ssh gz.butcoder.com 'KUBECONFIG=/etc/rancher/k3s/k3s.yaml helm status monitoring -n monitoring'
```

## 8. Dashboard 维护模型

Grafana dashboard 分两类维护：

- **系统预设 dashboard**
  - 来源：`victoria-metrics-k8s-stack` chart 自带
  - 继续由 Helm / chart 管理
  - 不在 repo 里单独导出维护
- **自定义 dashboard**
  - 来源：你在 Grafana Web 新建或 agent 直接生成
  - 不接入 Helm provisioning / sidecar / Git Sync
  - 改为 **Grafana HTTP API + repo 回收**

这样做的边界：

- `helm upgrade monitoring` 只管 Grafana 实例、datasource、系统预设 dashboard
- 自定义 dashboard 独立于 Helm release
- Web 可以直接调 dashboard
- agent 可以把 Web 改动回收进 repo，并从 repo 再推回 Grafana

### 8.1 Grafana Folder 约定

- `Infra`
  - 基础设施级 dashboard
  - 例如：`Global Nodes`
- `Apps`
  - 业务应用 dashboard
  - 例如：某个 app 的 Overview / Errors / Latency

### 8.2 repo 目录约定

- `infra/platform/monitoring/grafana/README.md`
- `infra/platform/monitoring/grafana/_meta/index.yaml`
- `infra/platform/monitoring/grafana/infra/`
- `infra/platform/monitoring/grafana/apps/`
- `infra/platform/monitoring/grafana/scripts/`

### 8.3 自定义 dashboard 托管接口

主清单文件：

- `infra/platform/monitoring/grafana/_meta/index.yaml`

固定字段：

- `folders[*].key`
- `folders[*].uid`
- `folders[*].title`
- `folders[*].description`
- `dashboards[*].key`
- `dashboards[*].uid`
- `dashboards[*].folder`
- `dashboards[*].path`
- `dashboards[*].tags`

约定：

- `uid` 必须稳定
- 一个 JSON 文件只对应一个 dashboard
- 所有自定义 dashboard 都打 `managed-by-repo` tag

## 9. Dashboard 日常维护流程

### 9.1 新建 dashboard

1. 在 Grafana Web 里进入 `Infra` 或 `Apps` Folder
2. 新建 dashboard，并设置稳定 UID（例如 `infra-global-nodes`）
3. 调整到满意后，让 agent 执行导出脚本
4. JSON 回收到 repo，并补齐 `index.yaml`
5. 写变更单

### 9.2 Web 微调后回收 repo

```bash
source infra/.secrets/grafana-api.env
bash infra/platform/monitoring/grafana/scripts/export-dashboard.sh infra-global-nodes
```

如果要整组回收：

```bash
source infra/.secrets/grafana-api.env
bash infra/platform/monitoring/grafana/scripts/export-folder.sh infra
```

### 9.3 repo 改完推回 Grafana

```bash
source infra/.secrets/grafana-api.env
bash infra/platform/monitoring/grafana/scripts/apply-dashboard.sh infra-global-nodes
```

或者整组：

```bash
source infra/.secrets/grafana-api.env
bash infra/platform/monitoring/grafana/scripts/apply-folder.sh infra
```

### 9.4 当前第一张自定义 dashboard

- Folder：`Infra`
- Dashboard：`Global Nodes`
- UID：`infra-global-nodes`
- JSON：`infra/platform/monitoring/grafana/infra/global-nodes.json`

用途：

- 多节点 CPU 利用率
- 多节点内存利用率
- 多节点根分区使用率
- 多节点网络收发速率
- 多节点 Pod 数量
- CPU / 内存 requests 与 allocatable 占比

## 10. 部署注意事项

- 本次首次部署时，`docker.io` / `registry.k8s.io` / `quay.io` 的镜像拉取在 `gz` 上失败。
- 处理方式：
  - 本地通过 `127.0.0.1:7890` 代理使用 `crane pull --platform linux/amd64` 拉取镜像 tarball
  - 将 tarball 同步到 `gz:/home/ubuntu/monitoring-image-archives/`
  - 在 `gz` 执行 `sudo k3s ctr -n k8s.io images import <tar>`
- 这一步已记录在变更单；后续若扩容或重建 `gz`，需要优先检查镜像拉取是否正常。

## 11. 快速排障

Pod 没起来时，按下面顺序查：

```bash
kubectl get pods -n monitoring -o wide
kubectl describe pod -n monitoring <pod-name>
kubectl logs -n monitoring <pod-name> --all-containers
kubectl get events -n monitoring --sort-by=.lastTimestamp | tail -n 30
```

如果是 Helm 失败：

```bash
ssh gz.butcoder.com 'KUBECONFIG=/etc/rancher/k3s/k3s.yaml helm history monitoring -n monitoring'
ssh gz.butcoder.com 'KUBECONFIG=/etc/rancher/k3s/k3s.yaml helm status monitoring -n monitoring'
```

如果是镜像拉取失败，优先检查：

- `gz` 到 `docker.io` / `quay.io` / `registry.k8s.io` 的连通性
- 是否需要重新走本地 `7890` 代理拉 tarball 再导入
- `sudo k3s ctr -n k8s.io images ls | grep <image>`

如果是 Grafana 节点 dashboard 有数据但 CPU / 内存面板显示 `No data`，优先检查：

```bash
kubectl -n monitoring port-forward svc/vmsingle-monitoring 8428:8428
curl -G 'http://127.0.0.1:8428/prometheus/api/v1/query' \
  --data-urlencode 'query=node_uname_info'
```

预期 `instance` / `nodename` 为节点名，例如：

- `vm-8-11-ubuntu`
- `vm-0-11-ubuntu`

若还是 PodIP 或 Pod 名，说明 node-exporter 的 scrape relabel 没生效，检查 `infra/platform/monitoring/victoria-metrics-k8s-stack/values.yaml` 里的 `prometheus-node-exporter.vmScrape.spec`。

如果是自定义 dashboard API 同步失败，优先检查：

- `kubectl -n monitoring port-forward svc/monitoring-grafana 3000:80` 是否正在运行
- `infra/.secrets/grafana-api.env` 是否存在且凭据正确
- `curl "$GRAFANA_URL/api/health"` 是否返回正常
- dashboard `uid` 是否已在 `infra/platform/monitoring/grafana/_meta/index.yaml` 注册

## 12. 后续扩展

本阶段稳定后，再新增：

- blackbox exporter
- 节点间 HTTP/TCP/ICMP 探测
- WireGuard / Kilo 链路监控
- 告警通知渠道（企业微信 / 邮件 / Telegram）
- 若需要长期远程查看，再考虑 VPN 或统一认证入口
