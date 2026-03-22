# 变更单：<标题>

- 日期：YYYY-MM-DD
- 变更人：<your name>
- 状态：Draft / Planned / In-Progress / Done / Rolled back
- 关联版本锁定：`infra/k3s/versions.yaml`

## 1. 目的与范围

- 目的：
- 影响范围（命名空间/服务/节点）：
- 预期停机/抖动：

## 2. 风险评估

- 主要风险：
- 缓解措施：

## 3. 变更前检查（必须）

- [ ] `kubectl get nodes -o wide`：全部 Ready
- [ ] `kubectl get pods -A -o wide`：核心组件健康
- [ ] 磁盘空间充足（尤其是 master）
- [ ] 端口/安全组检查（见 `infra/03-端口与安全组.md`）

## 4. 变更内容（引用 repo 文件路径）

- 变更点 1（附关键 diff 摘要）：
- 变更点 2：

## 5. 执行步骤（含命令与“在哪里执行”）

> 示例格式：
> - 本地：`kubectl apply -f ...`
> - gz：`ssh gz.butcoder.com "..." `
> - sg：`ssh sg.butcoder.com "..." `

1. 步骤 1：
2. 步骤 2：

## 6. 验证项（必须可重复）

- [ ] `kubectl get nodes -o wide`
- [ ] `kubectl get pods -A -o wide`
- [ ] 跨节点连通性测试（PodIP + ClusterIP）
- [ ] 如涉及 ingress：`kubectl -n ingress-nginx get pods,svc -o wide`

## 7. 回滚步骤（必须可操作）

- kubectl：回滚到旧 manifest（或 `kubectl rollout undo`）
- helm：`helm rollback <release> <revision>`
- 如涉及 k3s：说明卸载脚本位置与步骤

## 8. 结果与后续

- 结果（贴关键输出摘要，避免敏感信息）：
- 后续工作（Runbook/ports/versions 是否需要更新）：
