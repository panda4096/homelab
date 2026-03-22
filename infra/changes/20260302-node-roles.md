# 变更单：将节点 ROLES 显示统一为 master/worker（替代 control-plane/<none>）

- 日期：2026-03-02
- 状态：Done
- 关联文档：`infra/02-集群搭建.md`

## 1. 目的与范围

- 目的：让 `kubectl get nodes` 的 `ROLES` 列更直观（`master`/`worker`），便于日常识别节点角色。
- 影响范围：仅修改 Node labels（不涉及 k3s 组件升级/重启）。

## 2. 风险评估

- 风险：少量组件/脚本可能依赖 `node-role.kubernetes.io/control-plane` label 识别控制面节点。
- 缓解：如后续安装的组件要求 `control-plane`，可按回滚步骤恢复该 label。

## 3. 变更前检查

- [x] `kubectl get nodes`：节点均 `Ready`

## 4. 变更内容

- 将 gz 节点的 `node-role.kubernetes.io/control-plane` 替换为 `node-role.kubernetes.io/master`
- 为 sg 节点增加 `node-role.kubernetes.io/worker`

## 5. 执行步骤（本地/操作机）

```bash
# gz（control-plane）-> master
kubectl label node vm-8-11-ubuntu node-role.kubernetes.io/master=true --overwrite
kubectl label node vm-8-11-ubuntu node-role.kubernetes.io/control-plane- || true

# sg（<none>）-> worker
kubectl label node vm-0-11-ubuntu node-role.kubernetes.io/worker=true --overwrite
```

## 6. 验证项

```bash
kubectl get nodes
kubectl get nodes --show-labels | sed -n '1,3p'
```

预期结果（摘要）：

- `vm-8-11-ubuntu`：`ROLES=master`
- `vm-0-11-ubuntu`：`ROLES=worker`

## 7. 回滚步骤

```bash
# 恢复 control-plane（如需要）
kubectl label node vm-8-11-ubuntu node-role.kubernetes.io/control-plane=true --overwrite
kubectl label node vm-8-11-ubuntu node-role.kubernetes.io/master- || true

# 移除 worker label（恢复为 <none>）
kubectl label node vm-0-11-ubuntu node-role.kubernetes.io/worker- || true
```

## 8. 结果与后续

- 结果：`kubectl get nodes` 已显示 `master/worker`
- 后续：如果未来安装的组件依赖 `control-plane` label，可按回滚步骤恢复
