# 变更单：跨地域代理网关架构刷新与广州残留 clash 清理

- 日期：2026-04-04
- 变更人：Codex
- 状态：Done
- 关联版本锁定：`infra/k3s/versions.yaml`

## 1. 目的与范围

- 目的：
  - 将原始 `gz-sg-kilo-k8s-architecture` 草案升级为统一命名、可实施的平台代理架构文档
  - 清理广州宿主机残留 `clash` 进程
  - 修正 `infra` 中与当前运行态不一致的 `clash` 端口登记
- 影响范围（命名空间/服务/节点）：
  - 文档：`infra/README.md`、`infra/02-集群搭建.md`、`infra/03-端口与安全组.md`
  - 架构文档：`infra/06-跨地域代理网关架构.md`
  - 节点：`gz`
- 预期停机/抖动：
  - `gz` 上本地残留 `clash` 进程停止；当前集群业务面无停机

## 2. 风险评估

- 主要风险：
  - 误判 `clash` 进程来源，误伤仍在使用的本地代理
  - 文档变更后未同步后续实施口径
- 缓解措施：
  - 先确认 `clash` 无 systemd 服务且集群内无对应 Service
  - 将架构、端口和 Runbook 入口同步更新

## 3. 变更前检查（必须）

- [x] `kubectl get nodes -o wide`：全部 Ready
- [x] `kubectl get pods -A -o wide`：核心组件健康
- [x] 磁盘空间充足（尤其是 master）
- [x] 端口/安全组检查（见 `infra/03-端口与安全组.md`）

## 4. 变更内容（引用 repo 文件路径）

- 架构文档重命名并重写：
  - `infra/gz-sg-kilo-k8s-architecture.md`
  - → `infra/06-跨地域代理网关架构.md`
- 文档索引更新：
  - `infra/README.md`
  - `infra/02-集群搭建.md`
- 端口清单修正：
  - `infra/03-端口与安全组.md`
- 运行态清理：
  - 停止 `gz` 宿主机残留 `clash` 进程 `PID 1911750`

## 5. 执行步骤（含命令与“在哪里执行”）

1. 本地：检查集群状态与 Kilo 运行态
2. 本地：确认集群内无 `clash` Service
3. gz：检查残留 `clash` 进程、监听端口与 systemd 服务
4. gz：`sudo kill -TERM 1911750`
5. 本地：重命名并更新 `infra` 文档

## 6. 验证项（必须可重复）

- [x] `kubectl get nodes -o wide`
- [x] `kubectl get pods -A -o wide`
- [x] 集群内无 `clash` Service
- [x] `gz` 上 `7890/7891/9090` 不再监听

## 7. 回滚步骤（必须可操作）

- 文档：恢复相关 markdown 到上一个版本
- 宿主机：如确需恢复本地 `clash`，按原启动方式重新启动，但不建议继续以手工后台进程方式长期运行

## 8. 结果与后续

- 结果（贴关键输出摘要，避免敏感信息）：
  - `kubectl get svc -A | rg clash` 无输出
  - `gz` 上 `clash` 无 systemd 单元，系手工启动残留进程
  - `kill -TERM` 后 `7890/7891/9090` 已不再监听
  - 新架构文档已统一为 `infra/06-跨地域代理网关架构.md`
- 后续工作（Runbook/ports/versions 是否需要更新）：
  - 下一步按 `06` 文档补 `edge.role` / `edge.location`
  - 规划 `edge-system` namespace、控制面和多协议数据面
