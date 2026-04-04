# 变更单：gz k3s 镜像拉取经 sg 出口代理（2026-04-05）

## 背景

- `gz` 之前对 `docker.io`、`ghcr.io`、`quay.io` 等外部镜像仓库可达性不稳定。
- 现有 workaround 主要是：
  - 配置有限的 registry mirror
  - 在别处拉取 tar 后手工导入 `gz` 的 containerd
- 集群现已具备稳定的 `gz -> sg` 跨地域代理链路，且 `gz` 本机可通过 `127.0.0.1:11081` 复用该出口。

## 目标

- 让 `gz` 上 `k3s/containerd` 默认经 `sg` 出口代理拉取镜像。
- 减少后续部署平台组件时的手工离线导入成本。

## 实际变更

在 `gz` 写入并启用：

- `/etc/systemd/system/k3s.service.env`

内容方向：

- `HTTP_PROXY=http://edge-user:<password>@127.0.0.1:11081`
- `HTTPS_PROXY=http://edge-user:<password>@127.0.0.1:11081`
- `NO_PROXY=127.0.0.1,localhost,10.0.0.0/8,10.4.0.0/16,10.42.0.0/16,10.43.0.0/16,.svc,.cluster.local,...`

然后执行：

```bash
sudo systemctl daemon-reload
sudo systemctl restart k3s
```

## 验证

链路验证：

```bash
ssh gz.butcoder.com 'curl --proxy "http://edge-user:<password>@127.0.0.1:11081" https://api.ipify.org'
```

期望返回：

- `43.156.60.56`

节点恢复验证：

```bash
kubectl get nodes
kubectl get pods -A
```

镜像拉取验证：

```bash
ssh gz.butcoder.com 'sudo k3s crictl pull docker.io/library/hello-world:latest'
ssh gz.butcoder.com 'sudo k3s crictl pull ghcr.io/stefanprodan/podinfo:6.7.1'
```

本次实测结果：

- `docker.io/library/hello-world:latest` 拉取成功
- `ghcr.io/stefanprodan/podinfo:6.7.1` 拉取成功
- 控制面重启后恢复 `Ready`

## 结论

- `gz` 当前默认可经 `sg` 出口完成容器镜像拉取。
- 后续新增平台组件时，应优先复用此链路，而不是默认走离线导入。
- registry mirror 与离线导入保留为 fallback。
