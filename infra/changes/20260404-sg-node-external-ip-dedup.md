# 2026-04-04 sg node-external-ip dedup

## 目的

清理 `sg` 节点重复的 `--node-external-ip` 配置，避免 `k3s` 持续报 `Duplicate value: ExternalIP`，同时保持现有公网地址行为不变。

## 现象

`vm-0-11-ubuntu` 当前同时在两处配置了同一公网 IP：

- `/etc/rancher/k3s/config.yaml`
- `/etc/systemd/system/k3s-agent.service.d/override.conf`

运行态体现为：

- `k3s.io/node-args` 中出现两次 `--node-external-ip 43.156.60.56`
- `k3s.io/external-ip` 变成 `43.156.60.56,43.156.60.56`
- `k3s` 日志持续报 `Node ... status.addresses[2]: Duplicate value: {"Type":"ExternalIP","Address":"43.156.60.56"}`

## 变更

在 `sg` 上移除 systemd override，仅保留：

```yaml
node-external-ip: 43.156.60.56
```

重载并重启：

```bash
sudo mv /etc/systemd/system/k3s-agent.service.d/override.conf \
  /etc/systemd/system/k3s-agent.service.d/override.conf.disabled.<ts>
sudo systemctl daemon-reload
sudo systemctl restart k3s-agent
```

## 验证

预期：

- `vm-0-11-ubuntu` 恢复 `Ready`
- `k3s.io/node-args` 中只保留一个 `--node-external-ip`
- `k3s.io/external-ip` 只保留一个 `43.156.60.56`
- 监控与网络探针继续正常
