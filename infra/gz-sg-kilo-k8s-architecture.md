# 广州入口 / 新加坡出口 / Kilo 承载 的 K8s 编排架构文档

## 1. 文档目的

本文档用于指导后续 AGENT 在现有 Kubernetes + Kilo 环境上实现一套**跨地域入口/出口架构**：

- 客户端优先接入广州入口节点
- 广州到新加坡之间复用现有 Kilo / WireGuard 加密链路
- 最终由新加坡节点统一对外建立连接
- 整体尽量复用 Kubernetes 编排能力，便于后续增加入口节点、出口节点、出口池和做滚动升级
- 本文档仅覆盖通用网络与平台工程实现；不覆盖任何绕过第三方地域访问控制或审查系统的用途设计

---

## 2. 现状与已知条件

### 2.1 已有条件
- 已有广州与新加坡两台服务器
- 已使用 Kilo 通过公网建立统一网络平面
- 两地节点已经具备基础互通能力
- 计划后续继续扩展节点数和出口能力

### 2.2 关键技术事实
- Kilo 负责跨节点 WireGuard、路由和必要的 iptables 维护
- Kilo 不是业务代理层；它提供的是跨地域三层加密传输平面
- Kubernetes DaemonSet 适合部署节点级网络组件
- `hostNetwork: true` 让 Pod 直接使用宿主机网络命名空间

---

## 3. 需求定义

## 3.1 功能性需求
1. 国内客户端优先从广州接入
2. 广州到新加坡走现有 Kilo/WireGuard 链路
3. 新加坡作为统一海外出口
4. 支持后续增加多个广州入口节点
5. 支持后续增加多个新加坡出口节点
6. 支持滚动升级、灰度、健康摘除和故障切换
7. 尽量不依赖手工维护每台宿主机进程

## 3.2 非功能性需求
1. 数据面尽量短，不额外引入 Service VIP / NodePort / kube-proxy 路径
2. 节点角色清晰：入口节点与出口节点分离
3. 运维边界清晰：Kilo 负责传输平面，Relay/Egress 负责业务数据面
4. 扩容方式标准化：靠节点标签和 Kubernetes workload 调度扩展
5. 可观测：至少能看到连接数、失败率、健康状态、链路 RTT、带宽占用

## 3.3 非目标
1. 不把整个广州节点的默认路由整体改到新加坡
2. 不把 Kilo 当成“自动提供代理能力”的组件
3. 不强依赖 ClusterIP / NodePort / LoadBalancer 作为核心数据面
4. 不在 v1 方案中优先实现透明转发 / 全局路由改造

---

## 4. 架构决策

## 4.1 选择的方案
采用：

- **Kilo 作为跨地域传输平面**
- **广州入口节点部署 hostNetwork 的 Ingress Relay**
- **新加坡出口节点部署 hostNetwork 的 Egress Relay / Gateway**
- **入口与出口均使用 DaemonSet 编排**
- **节点通过 labels / affinity / taints 做角色隔离**

## 4.2 为什么这样选
这是最符合当前目标的方案，因为它同时满足：

- 广州就近接入
- 广州到新加坡走现有稳定链路
- 新加坡统一出口
- 后续节点扩容不需要重做整体架构
- 入口/出口组件仍在 Kubernetes 生命周期内，升级和回滚更容易
- 不把核心路径建立在 Service VIP / NodePort / kube-proxy 上

## 4.3 明确不用的方案
### 方案 A：普通 Pod + Service/NodePort
不选。理由：
- 数据面多一层 Service/kube-proxy
- 排障复杂
- 对网络中继场景没有明显收益

### 方案 B：整机默认路由改造
不选。理由：
- 会放大故障面
- 影响 kubelet、镜像拉取、节点管理流量
- 难以灰度和回滚

### 方案 C：宿主机手工 systemd 常驻进程
可行，但不是首选。理由：
- 脱离 Kubernetes 生命周期
- 配置漂移和版本一致性更难控制

---

## 5. 推荐的数据面模式

## 5.1 v1 默认模式：用户态 TCP/L4 Relay
默认建议先做 **用户态 TCP / L4 relay**：

```text
Client
  -> 广州公网入口
  -> 广州 ingress relay（hostNetwork）
  -> Kilo/WireGuard
  -> 新加坡 egress relay（hostNetwork）
  -> 目标服务
```

特点：
- 不依赖宿主机 IP 转发/NAT 才能工作
- 更适合在 Kubernetes 中以普通用户态代理进程运行
- 升级和回滚更温和
- 更容易做健康检查、超时、连接池、日志与观测

## 5.2 v2 可选模式：透明转发 / 出口网关
只有在明确需要 UDP、透明代理、路由级转发时，再演进为主机级转发/NAT 方案。  
这个模式会引入更重的宿主机网络配置和更高的排障成本，不作为首选。

---

## 6. 总体架构图

```text
                           ┌─────────────────────────────┐
                           │ Kubernetes Cluster          │
                           │ (multi-location via Kilo)   │
                           └─────────────────────────────┘

Client
  |
  v
[ Guangzhou Public IP ]
  |
  v
[ edge-ingress DaemonSet Pod ]
  - hostNetwork: true
  - 监听宿主机端口
  - 仅做 relay / stream proxy
  |
  |  (Kilo / WireGuard / L3 encrypted path)
  v
[ edge-egress DaemonSet Pod ]
  - hostNetwork: true
  - 仅允许来自广州入口的连接
  - 负责对外建立连接
  |
  v
[ Singapore Public Egress ]
  |
  v
Destination
```

---

## 7. 组件职责拆分

## 7.1 Kilo
职责：
- 负责跨地域节点互通
- 负责 WireGuard 接口
- 负责路由和必要的 iptables 维护
- 负责 location / leader / endpoint 等网络拓扑语义

不负责：
- 业务层代理
- 出口池管理
- 协议中继策略
- 应用健康检查
- 灰度和上游选择

## 7.2 广州 Ingress Relay
职责：
- 暴露广州本地入口
- 接收客户端流量
- 根据配置选择新加坡上游
- 通过 Kilo 私网地址转发到新加坡出口实例
- 提供健康状态、日志、连接统计

不负责：
- 直接对外访问目标服务
- 改写宿主机默认路由

## 7.3 新加坡 Egress Relay
职责：
- 只接受来自广州入口的流量
- 作为统一海外出口
- 建立到目标服务的实际外连
- 记录出站指标
- 对不可用目标做失败返回

不负责：
- 作为 ClusterIP 服务暴露给整个集群的普通业务流量

---

## 8. Kubernetes 资源设计

## 8.1 Namespace
建议单独使用：

- `edge-system` 或 `edge-gateway`

原因：
- 便于权限、审计、Pod Security 和运维边界控制
- 与普通业务 workload 隔离

## 8.2 节点标签
建议至少打这些标签：

- `edge.role=ingress`
- `edge.role=egress`
- `edge.location=gz`
- `edge.location=sg`

如果节点已经有标准地域标签，可保留并补充业务标签。  
如需让 Kilo 明确识别 location，使用其 location annotation。

## 8.3 可选 taints
如果要把入口/出口节点专用化，可对节点加 taint，例如：

- `edge-role=ingress:NoSchedule`
- `edge-role=egress:NoSchedule`

对应 DaemonSet 增加 tolerations。

## 8.4 DaemonSet：广州入口
资源建议：
- `apps/v1 DaemonSet`
- 名称：`edge-ingress-relay`
- `hostNetwork: true`
- `dnsPolicy: ClusterFirstWithHostNet`
- `nodeSelector` 或 `nodeAffinity` 只落在 `edge.role=ingress`
- `updateStrategy: RollingUpdate`
- 配置来源：ConfigMap / Secret
- 端口：显式声明 `containerPort`
- 健康：liveness/readiness/startup probes

## 8.5 DaemonSet：新加坡出口
资源建议：
- `apps/v1 DaemonSet`
- 名称：`edge-egress-relay`
- `hostNetwork: true`
- `dnsPolicy: ClusterFirstWithHostNet`
- `nodeSelector` 或 `nodeAffinity` 只落在 `edge.role=egress`
- `updateStrategy: RollingUpdate`
- 健康：liveness/readiness/startup probes
- 入口 ACL：只允许来自广州入口节点或广州 Kilo 网段

## 8.6 ConfigMap
建议拆分为两个 ConfigMap：

### ingress config
- 监听端口列表
- 上游 egress 池列表
- 健康检查间隔
- 失败重试策略
- 空闲连接超时
- 连接上限

### egress config
- 允许的来源 CIDR / 节点列表
- 出站超时
- 日志级别
- 目标路由策略（如果有）

## 8.7 Secret
仅在需要以下能力时使用：
- TLS 私钥
- 身份认证凭据
- 上游认证信息

---

## 9. Kilo 相关约束（AGENT 必须显式检查）

## 9.1 节点连通性
AGENT 必须确认：
1. 广州节点能通过 Kilo 地址访问新加坡节点
2. 新加坡节点能回广州节点
3. 实测链路 RTT、带宽和丢包满足预期

## 9.2 Kilo endpoint/leader/location
若节点公网出口、私网地址或地域识别不稳定，AGENT 必须检查并按需配置：

- `kilo.squat.ai/force-endpoint`
- `kilo.squat.ai/force-internal-ip`
- `kilo.squat.ai/location`
- `kilo.squat.ai/leader`

### 特别注意
Kilo 默认按“location 粒度”选 leader 节点，并由 leader 充当跨 location 网关。  
因此，当未来扩展到多广州节点 / 多新加坡节点时，**leader 节点规格、带宽、开放 UDP 端口、外网稳定性**都要纳入设计。  
如果后续规模变大，再评估 Kilo topology / pool 模式。

## 9.3 NAT/防火墙
AGENT 必须确认：
- Kilo 使用的 UDP 端口在各 location 的 leader/endpoint 节点是开放的
- 节点安全组/防火墙允许跨地域 WireGuard 通信
- 不同 location 之间的回程路径稳定

---

## 10. 数据流设计

## 10.1 正常路径
1. 客户端连接广州入口公网 IP:PORT
2. 广州入口 relay 在宿主机网络命名空间接收连接
3. 广州入口根据上游池选择新加坡 egress Kilo IP:PORT
4. 流量通过 Kilo / WireGuard 从广州节点传到新加坡节点
5. 新加坡 egress 对外建立目标连接
6. 返回流量原路回到广州入口
7. 广州入口返回给客户端

## 10.2 失败摘除路径
1. 广州入口定期探测新加坡 egress 健康
2. 某个 egress 连续失败达到阈值
3. 广州入口将其从上游池摘除
4. 健康恢复后再自动放回

## 10.3 扩容路径
1. 新增新加坡节点
2. 打上 `edge.role=egress`
3. DaemonSet 自动在该节点起 Pod
4. 将该节点加入 ingress 上游池
5. 开始承接流量

---

## 11. 推荐的调度与升级策略

## 11.1 调度
- 入口和出口都用 **nodeSelector + nodeAffinity**
- 如果节点专用化，再叠加 **taints + tolerations**
- 不让普通业务和边缘中继混跑，除非资源确实足够且风险可接受

## 11.2 升级
- DaemonSet 使用 `RollingUpdate`
- `maxUnavailable: 1`
- 配合 readiness probe，确保新实例 ready 后再替换旧实例
- 升级顺序：
  1. 先升级新加坡出口
  2. 再升级广州入口

## 11.3 回滚
- 使用镜像 tag 固定版本
- 保留上一版本 ConfigMap
- 回滚顺序与升级相反时需谨慎；优先回滚入口，再视情况回滚出口

---

## 12. 观测与运维要求

## 12.1 必备指标
广州入口：
- 当前连接数
- 新建连接速率
- 失败连接数
- 每个上游 egress 的健康状态
- 转发字节数 / 吞吐

新加坡出口：
- 当前出站连接数
- 出站失败率
- 平均连接建立时延
- 返回码 / 错误分类
- 带宽与 CPU 使用率

Kilo/节点：
- WireGuard 接口状态
- 跨地域 RTT
- 丢包
- leader 节点负载
- 节点网络错误

## 12.2 日志
- 接入日志
- 上游选择日志
- 健康检查日志
- 连接失败原因
- 配置热加载/重启事件

## 12.3 告警
至少做：
- 新加坡 egress 全部不可用
- 广州 ingress 无可用上游
- Kilo 对端不可达
- 单节点连接数异常飙升
- 进程重启频繁
- DaemonSet 未在预期节点就绪

---

## 13. 安全与隔离要求

## 13.1 Namespace/Pod Security
由于使用 `hostNetwork`，AGENT 必须确认部署 namespace 的 Pod Security 策略不会拦截这类 Pod。  
如果集群启用了 Pod Security Admission，需为该 namespace 做合适的策略选择或豁免。

## 13.2 网络访问控制
- 新加坡 egress 的监听端口不应直接对公网开放给任意来源
- 只允许广州入口节点或其 Kilo 地址访问
- 出口节点最小开放面原则
- 镜像来源、镜像签名、Secret 使用要规范化

## 13.3 配置权限
- 只有平台管理员可以变更 node labels / taints / Kilo annotations
- Relay 配置文件变更要走 GitOps 或受控发布

---

## 14. 分阶段实施计划

## Phase 0：基线验证
目标：
- 确认 Kilo 互通、带宽、RTT、丢包
- 确认两地节点标签与 location 信息正确
- 确认 Pod Security 不会拦截 hostNetwork DaemonSet

交付：
- 连通性验证报告
- 节点标签与 Kilo annotation 清单

## Phase 1：新加坡 Egress
目标：
- 先在新加坡落地 egress DaemonSet
- 提供本地健康检查端点
- 只允许 Kilo 内网来源

交付：
- `edge-egress-relay` DaemonSet
- egress ConfigMap
- 观测指标与日志

## Phase 2：广州 Ingress
目标：
- 广州入口上线
- 接入 egress 池
- 完成端到端流量打通

交付：
- `edge-ingress-relay` DaemonSet
- ingress ConfigMap
- 上游池健康摘除逻辑

## Phase 3：高可用
目标：
- 新增第 2 个新加坡出口
- 广州入口具备上游摘除和恢复能力
- 做滚动升级演练

交付：
- 多出口池
- 失败切换验证记录
- 升级/回滚 SOP

## Phase 4：规模化
目标：
- 新增更多广州入口节点
- 评估 Kilo leader 带宽与 topology 是否需要调整
- 完成容量规划

交付：
- 容量模型
- leader/topology 调整建议
- 性能压测报告

---

## 15. AGENT 执行清单

AGENT 必须按以下顺序工作：

1. **盘点现有集群**
   - 列出所有节点、地域、标签、Kilo 状态
   - 标识广州和新加坡节点

2. **核对 Kilo**
   - 验证 node-to-node Kilo 可达
   - 检查 `location`、`leader`、`force-endpoint` 是否需要显式配置
   - 检查 WireGuard UDP 端口与防火墙

3. **建立命名与标签规范**
   - namespace
   - node labels
   - taints/tolerations（如需）

4. **先部署新加坡 egress**
   - hostNetwork DaemonSet
   - readiness / liveness / startup probe
   - 内网监听限制
   - 日志和指标

5. **再部署广州 ingress**
   - hostNetwork DaemonSet
   - 上游池配置
   - 健康摘除
   - 灰度端口

6. **端到端验证**
   - 连通性
   - 并发
   - 故障切换
   - 滚动升级

7. **产出运维资料**
   - 发布步骤
   - 回滚步骤
   - 常见故障定位清单

---

## 16. 验收标准

满足以下条件才算完成：

### 功能验收
- 客户端可从广州入口稳定接入
- 广州到新加坡走 Kilo 链路
- 新加坡出口可稳定建立外连
- 多个 egress 节点时，ingress 能正确摘除故障节点

### 架构验收
- 数据面不依赖 ClusterIP/NodePort
- 入口和出口均运行在 hostNetwork DaemonSet 中
- 节点角色通过标签可控扩容
- Kilo 的 location / leader 语义可解释、可维护

### 运维验收
- 能滚动升级
- 能回滚
- 有监控
- 有日志
- 有故障定位 SOP

---

## 17. 建议的资源命名

- Namespace: `edge-system`
- DaemonSet:
  - `edge-ingress-relay`
  - `edge-egress-relay`
- ConfigMap:
  - `edge-ingress-config`
  - `edge-egress-config`
- Secret:
  - `edge-ingress-secret`
  - `edge-egress-secret`

节点标签建议：
- `edge.role=ingress|egress`
- `edge.location=gz|sg`

---

## 18. Manifest 轮廓（示意）

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: edge-system
---
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: edge-ingress-relay
  namespace: edge-system
spec:
  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
  selector:
    matchLabels:
      app: edge-ingress-relay
  template:
    metadata:
      labels:
        app: edge-ingress-relay
    spec:
      hostNetwork: true
      dnsPolicy: ClusterFirstWithHostNet
      nodeSelector:
        edge.role: ingress
      tolerations: []
      containers:
      - name: relay
        image: <relay-image>
        ports:
        - containerPort: <listen-port>
          protocol: TCP
        readinessProbe:
          tcpSocket:
            port: <listen-port>
        livenessProbe:
          tcpSocket:
            port: <listen-port>
        startupProbe:
          tcpSocket:
            port: <listen-port>
        volumeMounts:
        - name: config
          mountPath: /etc/edge
      volumes:
      - name: config
        configMap:
          name: edge-ingress-config
```

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: edge-egress-relay
  namespace: edge-system
spec:
  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
  selector:
    matchLabels:
      app: edge-egress-relay
  template:
    metadata:
      labels:
        app: edge-egress-relay
    spec:
      hostNetwork: true
      dnsPolicy: ClusterFirstWithHostNet
      nodeSelector:
        edge.role: egress
      containers:
      - name: relay
        image: <relay-image>
        ports:
        - containerPort: <egress-listen-port>
          protocol: TCP
        readinessProbe:
          tcpSocket:
            port: <egress-listen-port>
        livenessProbe:
          tcpSocket:
            port: <egress-listen-port>
        startupProbe:
          tcpSocket:
            port: <egress-listen-port>
```

---

## 19. 最终结论

最终采用的推荐方案是：

- **Kilo 只做跨地域加密传输平面**
- **广州做 hostNetwork 的节点级入口 relay**
- **新加坡做 hostNetwork 的节点级出口 relay**
- **两端都用 DaemonSet 管理**
- **节点通过 labels / affinity / taints 管理角色**
- **v1 优先做用户态 TCP/L4 relay**
- **后续如确有必要，再演进到更重的透明转发 / NAT / 网关模式**

这套方案在你的目标下最平衡：
- 结构清晰
- 数据面短
- 维护统一
- 容易扩容
- 适合交给自动化 AGENT 落地