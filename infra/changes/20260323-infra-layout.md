# 变更单：infra 目录分层重构（2026-03-23）

## 目的 / 范围 / 风险

- 目的：把 `infra/k3s/` 中“集群引导层”和“集群就绪后的平台层”拆开，避免 ingress 等后续组件继续混在 k3s 引导目录里。
- 范围：仅调整仓库目录与文档引用，不对线上集群执行任何 `kubectl apply` / `helm upgrade`。
- 风险：低。主要风险是文档路径和脚本引用失效，因此本次变更后统一做 repo 内路径校验。

## 变更前检查

- [x] 当前线上集群无需变更
- [x] 当前 ingress-nginx 资产位于 `infra/k3s/values/` 与 `infra/k3s/charts/`
- [x] 当前 Runbook / Prompt / 变更单存在旧路径引用

## 变更内容

- 新增 `infra/platform/`：平台层目录
- 新增 `infra/apps/`：业务工作负载层占位目录
- 迁移 ingress-nginx：
  - `infra/k3s/values/ingress-nginx.yaml` → `infra/platform/ingress-nginx/values.yaml`
  - `infra/k3s/charts/ingress-nginx-4.14.3.tgz` → `infra/platform/ingress-nginx/charts/ingress-nginx-4.14.3.tgz`
  - `infra/k3s/charts/README.md` → `infra/platform/ingress-nginx/README.md`
- 更新引用：
  - `infra/README.md`
  - `infra/02-集群搭建.md`
  - `infra/prompts/k3s-kilo-2node-codex.md`
  - `infra/k3s/versions.yaml`
  - `infra/changes/20260301-k3s-init.md`

## 执行命令

本地仓库执行：

```bash
mkdir -p infra/platform/ingress-nginx/charts infra/apps
mv infra/k3s/values/ingress-nginx.yaml infra/platform/ingress-nginx/values.yaml
mv infra/k3s/charts/ingress-nginx-4.14.3.tgz infra/platform/ingress-nginx/charts/ingress-nginx-4.14.3.tgz
mv infra/k3s/charts/README.md infra/platform/ingress-nginx/README.md
```

## 验证项

- [x] `infra/platform/README.md` 存在并说明职责边界
- [x] `infra/apps/README.md` 存在并作为后续应用目录占位
- [x] `infra/platform/ingress-nginx/values.yaml` 存在
- [x] `infra/platform/ingress-nginx/charts/ingress-nginx-4.14.3.tgz` 存在
- [x] repo 中旧 ingress 路径引用已替换

## 回滚步骤

如果需要恢复旧结构，仅在本地仓库执行：

```bash
mkdir -p infra/k3s/values infra/k3s/charts
mv infra/platform/ingress-nginx/values.yaml infra/k3s/values/ingress-nginx.yaml
mv infra/platform/ingress-nginx/charts/ingress-nginx-4.14.3.tgz infra/k3s/charts/ingress-nginx-4.14.3.tgz
mv infra/platform/ingress-nginx/README.md infra/k3s/charts/README.md
rm -rf infra/platform infra/apps
```

## 结果与后续

- 结果：`infra/` 现在按 `k3s -> platform -> apps` 分层，ingress-nginx 归位到平台层。
- 后续：
  - 监控、日志、cert-manager 等公共组件新增到 `infra/platform/<component>/`
  - 业务应用新增到 `infra/apps/<app>/`
  - 若后续平台组件增多，再考虑把 `infra/k3s/versions.yaml` 上收为 `infra/versions.yaml`
