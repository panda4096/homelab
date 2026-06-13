# 富途 OpenD Gateway

本文记录 Finbrain 为获取股票行情而在 NUC 上安装富途 OpenD Gateway 的当前状态，并作为后续本地登录验证、容器化改造和 Finbrain 行情接入的入口文档。

本仓库不保存任何真实富途账号、密码或登录态。

## 目标

用富途 OpenD 作为 Finbrain 的主要股票行情网关，替代自建网页爬虫作为主数据源。

预期收益：

- 官方结构化 API，避免解析网页。
- 支持实时行情订阅。
- 对港股、美股、A 股等市场的稳定性通常好于自建爬虫。
- 降低反爬、页面结构变更、接口失效带来的维护成本。

代价和约束：

- 依赖有效富途账号和对应行情权限。
- 依赖 OpenD 登录状态和富途 API 限制。
- OpenD 网关不仅能提供行情，也可能被客户端调用交易 API，因此不能随意暴露。

## 当前安装状态

宿主机：

- 机器：`NUC`
- 系统：Ubuntu 24.04.2 LTS，`x86_64`
- 角色：独立家庭 k3s 节点，同时承担 mihomo 软路由
- 网络：NUC 宿主机和 k3s/containerd 均可通过本机 mihomo TUN/代理访问海外资源

安装包：

- 来源：富途官方 OpenD Ubuntu 包
- 下载地址：
  `https://www.futunn.com/download/fetch-lasted-link?name=opend-ubuntu`
- 包大小：约 `428M`
- 解包版本：`10.7.6718`
- 下载包 SHA256：
  `9b1e94e005cfb5693798cdd74fce577dce27802deeb5dc663f8dff60283ea1ae`

NUC 上的安装路径：

- 程序：`/opt/futu-opend/current/FutuOpenD`
- 版本目录：`/opt/futu-opend/releases/10.7.6718/`
- 配置：`/etc/futu-opend/FutuOpenD.xml`
- 日志：`/var/log/futu-opend/`
- 启动前检查脚本：`/usr/local/sbin/futu-opend-preflight`
- systemd 服务：`/etc/systemd/system/futu-opend.service`
- 运行用户：`futu-opend`

当前服务状态：

- `futu-opend.service` 已安装。
- 当前为 `disabled`。
- 当前为 `inactive`。
- `11111` 端口当前没有监听。
- 配置仍为占位符时，preflight 会主动阻止服务启动，避免误用示例账号登录。

## 当前安全默认值

当前配置只监听本机：

```xml
<ip>127.0.0.1</ip>
<api_port>11111</api_port>
```

这是故意的。第一阶段只做 NUC 本机登录验证，避免在未确认权限边界前把 OpenD 暴露给 LAN 或 k8s Pod。

systemd 启动命令：

```ini
ExecStart=/opt/futu-opend/current/FutuOpenD -cfg_file=/etc/futu-opend/FutuOpenD.xml -console=1 -no_monitor=1 -simulate_trade=disable -log_path=/var/log/futu-opend
```

说明：

- `simulate_trade=disable` 只控制模拟交易功能，不代表网关天然只读。
- OpenD 仍应视为敏感服务，因为客户端理论上可以调用交易相关 API。
- Finbrain 后续应通过一个只读行情 adapter 访问 OpenD，不应把 OpenD 直接暴露给无关工作负载。

## 本地登录验证流程

以下命令在 NUC 上执行。

编辑配置：

```bash
sudoedit /etc/futu-opend/FutuOpenD.xml
```

替换占位符：

```xml
<login_account>CHANGE_ME</login_account>
<login_pwd_md5>CHANGE_ME_32_HEX_MD5</login_pwd_md5>
```

在 NUC 本机生成密码 MD5：

```bash
printf %s '你的富途登录密码' | md5sum | awk '{print $1}'
```

启动服务做验证：

```bash
sudo systemctl enable --now futu-opend
sudo systemctl status futu-opend --no-pager --full
sudo ss -lntup | grep 11111
```

查看日志：

```bash
sudo journalctl -u futu-opend -f
```

如果富途要求设备验证或登录确认，先在富途手机 App 或桌面端完成确认，再回来看 OpenD 日志。

登录成功后，用富途 OpenAPI SDK 在 NUC 本机验证行情接口。示例形态如下，暂不作为应用代码提交：

```python
from futu import OpenQuoteContext

quote_ctx = OpenQuoteContext(host='127.0.0.1', port=11111)
print(quote_ctx.get_global_state())
print(quote_ctx.get_market_snapshot(['US.AAPL', 'HK.00700']))
quote_ctx.close()
```

如果在 NUC 上用 Python 测试：

```bash
python3 -m venv /tmp/futu-test-venv
. /tmp/futu-test-venv/bin/activate
pip install futu-api
python /tmp/test-futu-opend.py
```

如果暂时不准备长期运行，验证完成后停掉：

```bash
sudo systemctl disable --now futu-opend
```

## NUC 代理说明

NUC 上的 mihomo 当前处于 active，提供显式代理和 TUN 透明代理：

- `mixed-port: 7890`
- `allow-lan: true`
- `tun.enable: true`
- `tun.auto-route: true`

安装时观察到：

- NUC 宿主机直接访问海外资源会被 mihomo 接管。
- 显式代理 `http://127.0.0.1:7890` 可用。
- k3s/containerd 拉镜像会被 mihomo 捕获；访问 Docker 官方 endpoint 时会走 `PROXY`。

因此 OpenD 本身从 NUC 访问富途海外 endpoint，理论上不需要单独配置 `HTTP_PROXY`。如果登录或行情连接出现网络错误，优先查看 mihomo 日志：

```bash
sudo journalctl -u mihomo --since '10 minutes ago' --no-pager
```

## 容器化改造计划

目标状态：

- OpenD 作为 NUC k3s 集群里的工作负载运行。
- 富途凭据放 Kubernetes Secret，不进镜像、不进仓库。
- OpenD 只暴露给 Finbrain 行情接入组件。
- OpenD 上游版本明确 pin 住。

建议的 Kubernetes 形态：

- Namespace：`finbrain`，或单独建 `market-data` namespace。
- Workload：单副本 `Deployment` 或 `StatefulSet`。
- 调度：通过 `nodeSelector` / affinity 固定到 `nuc`。
- 配置：用 Secret 生成 `FutuOpenD.xml`。
- 数据和日志：初期用 `emptyDir`；如果登录态或运行状态需要持久化，再加 PVC。
- Service：`ClusterIP`，端口 `11111`。
- NetworkPolicy：只允许 Finbrain quote-ingestion Pod 访问。
- 除非 OpenD 有无法绕开的网络限制，否则不要使用 `hostNetwork`。

镜像构建方案：

1. 从富途官方 Ubuntu 包构建内部镜像。
   - 校验并 pin SHA256。
   - 只复制命令行版 OpenD 文件，不复制 GUI AppImage。
   - 使用非 root 用户运行。
   - Entrypoint 运行 `FutuOpenD -cfg_file=/etc/futu-opend/FutuOpenD.xml`。

2. systemd 安装作为临时过渡方案。
   - 早期测试时 Finbrain 客户端可以通过 SSH tunnel 或临时 sidecar 访问。
   - 这对首次登录最简单，但不应作为最终部署形态。

初始 Dockerfile 草案：

```dockerfile
FROM ubuntu:24.04
RUN useradd --system --home /var/lib/futu-opend --shell /usr/sbin/nologin futu-opend
COPY Futu_OpenD_10.7.6718_Ubuntu18.04/ /opt/futu-opend/
RUN chown -R futu-opend:futu-opend /opt/futu-opend /var/lib/futu-opend
USER futu-opend
WORKDIR /opt/futu-opend
ENV LD_LIBRARY_PATH=/opt/futu-opend
ENTRYPOINT ["/opt/futu-opend/FutuOpenD"]
CMD ["-cfg_file=/etc/futu-opend/FutuOpenD.xml", "-console=1", "-no_monitor=1", "-simulate_trade=disable", "-log_path=/tmp/futu-opend"]
```

不要直接把富途官方大包提交进仓库，除非后续明确决定 vendor 第三方大二进制。更好的方式是写构建脚本：下载官方包、校验 SHA256、构建镜像。

## Finbrain 接入计划

Phase 1：手工本地验证

- 在 NUC 上填好 `/etc/futu-opend/FutuOpenD.xml`。
- 启动 `futu-opend.service`。
- 用临时 Python SDK 脚本验证：
  - global state
  - 已知 symbol 的 market snapshot
  - 一个美股和一个港股的历史 K 线
- 记录 API 行为、行情权限、延迟、限频情况。

Phase 2：行情 adapter

- 在 Finbrain 中新增 OpenD quote adapter。
- 将行情归一化写入 Finbrain 的 `prices` 模型。
- 应用层保持只读语义，不暴露交易调用。
- 增加 symbol 映射规则，例如 `US.AAPL`、`HK.00700`、`SH.600000`。

Phase 3：容器化 OpenD

- 构建 pin 版本的 OpenD 镜像。
- 增加 Kubernetes manifests。
- 增加 OpenD 配置 Secret 生成脚本。
- 增加 NetworkPolicy，只允许 Finbrain quote adapter 访问。
- 增加健康检查：TCP readiness + 登录/global state 检查。

Phase 4：爬虫降级

- 爬虫只作为 OpenD 不覆盖标的或非行情类数据的 fallback。
- OpenD 验证通过后，不再把爬虫作为流动性股票行情的主数据源。

## 运维命令

检查安装：

```bash
ssh NUC 'ls -l /opt/futu-opend/current/FutuOpenD /etc/futu-opend/FutuOpenD.xml'
ssh NUC 'systemctl status futu-opend --no-pager --full'
```

手工执行 preflight：

```bash
ssh NUC 'sudo -u futu-opend /usr/local/sbin/futu-opend-preflight /etc/futu-opend/FutuOpenD.xml'
```

启动：

```bash
ssh NUC 'sudo systemctl enable --now futu-opend'
```

停止：

```bash
ssh NUC 'sudo systemctl disable --now futu-opend'
```

查看日志：

```bash
ssh NUC 'sudo journalctl -u futu-opend -n 200 --no-pager'
```

检查端口：

```bash
ssh NUC 'sudo ss -lntup | grep 11111 || true'
```

## 待确认问题

- 这个富途账号是否需要周期性人工登录确认？
- 当前账号拥有哪些市场的行情权限：美股、港股、A 股分别是什么级别？
- OpenD 最终应该放在 `finbrain` namespace，还是单独的 `market-data` namespace？
- Finbrain 应该通过本地 sidecar、ClusterIP Service，还是独立 quote adapter service 访问 OpenD？
- 是否需要 WebSocket 模式，还是标准 OpenAPI TCP 协议已经足够？
