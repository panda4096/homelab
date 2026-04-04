# 2026-04-04 network probe reconciler job retention

## 目的

避免 `network-probe-reconciler` 的历史失败 Job 长时间保留，持续触发 `KubeJobFailed` 告警，影响当前网络监控面板与告警信号的可读性。

## 本次变更

文件：

- `infra/platform/monitoring/network/phase1-probes/phase1.yaml`

调整：

- 为 `CronJob/network-probe-reconciler` 增加 `successfulJobsHistoryLimit: 1`
- 为 `CronJob/network-probe-reconciler` 增加 `failedJobsHistoryLimit: 1`
- 为生成的 Job 增加 `ttlSecondsAfterFinished: 1800`

效果：

- 只保留极少量最近 Job 历史
- 已完成或失败的 Job 在 30 分钟后自动清理
- 避免旧失败 Job 长时间触发与当前状态无关的 `KubeJobFailed`

## 验证

预期命令：

```bash
export KUBECONFIG="$(pwd)/infra/.secrets/homelab-k3s.yaml"
kubectl apply -k infra/platform/monitoring/network/phase1-probes
kubectl -n monitoring get cronjob network-probe-reconciler -o yaml
kubectl -n monitoring get jobs
```

预期结果：

- `network-probe-reconciler` CronJob 已带上 history limit
- 新生成 Job 带有 `ttlSecondsAfterFinished: 1800`
- 旧失败 Job 删除后，`ALERTS{alertname="KubeJobFailed"}` 不再持续保留该历史噪音
