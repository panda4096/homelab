# 变更单：显式固定 ingress-nginx NodePort（2026-03-23）

## 目的 / 范围 / 风险

- 目的：把 ingress-nginx 当前实际使用的 NodePort（`30635/31372`）显式写入 repo，避免端口只存在于集群运行态。
- 范围：更新 `values.yaml` 与文档说明；本次不直接变更线上入口架构。
- 风险：低。当前端口与线上实际分配一致，后续执行 `helm upgrade` 时应保持不变。

## 变更内容

- 在 `infra/platform/ingress-nginx/values.yaml` 显式声明：
  - `controller.service.nodePorts.http=30635`
  - `controller.service.nodePorts.https=31372`
- 在 ingress 文档中补充：
  - 当前访问方式
  - 为什么 NodePort 不能直接改为 `80/443`
  - 如果需要公网 `80/443` 的可选方案

## 验证项

- [x] `infra/platform/ingress-nginx/values.yaml` 已显式声明 NodePort
- [x] `infra/platform/ingress-nginx/README.md` 已说明实际访问端口
- [x] `infra/03-端口与安全组.md` 已写明 NodePort 范围限制

## 后续

- 如果决定对外统一改成 `80/443`，单独出一份变更单，在以下方案中二选一：
  - 宿主机/云层转发 `80/443 -> 30635/31372`
  - ingress-nginx 改为直接绑定宿主机 `80/443`
