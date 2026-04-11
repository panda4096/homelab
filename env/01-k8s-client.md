# 01-k8s-client — kubectl / krew / helm

## 适用场景

运维 homelab k3s 集群所需要的本地客户端工具。

## 前置依赖

- `00-base.md` 已完成（需要 zsh、curl、jq）
- 有集群的 kubeconfig（见 `infra/README.md` 获取方式）

## 版本策略

### kubectl — **必须 pin**

kubectl 必须跟集群 k3s 的 minor 版本在 ±1 以内（官方支持偏差）。

查当前集群 k3s 版本：

```bash
grep '^  version:' infra/k3s/versions.yaml | head -1
# 输出形如: version: "v1.34.4+k3s1"  → 对应 k8s 1.34
# 或者（如果装了 yq）:
# yq '.k3s.version' infra/k3s/versions.yaml
```

查该 minor 的最新 kubectl：

```bash
curl -sSL https://dl.k8s.io/release/stable-1.34.txt
# 输出形如: v1.34.10
```

把查到的值写到 `env/versions.yaml` 的 `kubectl.current`，并更新 `last_verified`，然后按下面的安装步骤装。

### krew / krew 插件 / helm — **不 pin**

全部使用上游最新稳定版：

```bash
# krew 最新 release
curl -sSL https://api.github.com/repos/kubernetes-sigs/krew/releases/latest | jq -r .tag_name

# helm 最新 release
curl -sSL https://api.github.com/repos/helm/helm/releases/latest | jq -r .tag_name
```

## 安装步骤

### kubectl

```bash
# 1. 从 env/versions.yaml 的 kubectl.current 拷过来
KUBECTL_VERSION="v1.34.10"   # 示例, 实际从 versions.yaml 取

# 2. 架构
OS="$(uname | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m | sed -e 's/x86_64/amd64/' -e 's/aarch64/arm64/')"

# 3. 下载 + sha256 校验
cd /tmp
curl -fsSLO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/${OS}/${ARCH}/kubectl"
EXPECTED_SHA="$(curl -fsSL "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/${OS}/${ARCH}/kubectl.sha256")"
echo "${EXPECTED_SHA}  kubectl" | sha256sum -c -

# 4. 安装
sudo install -m 0755 kubectl /usr/local/bin/kubectl
rm kubectl
```

### krew + 常用插件

```bash
# krew 本体（官方一键脚本，自动取最新 release）
(
  set -x; cd "$(mktemp -d)" &&
  OS="$(uname | tr '[:upper:]' '[:lower:]')" &&
  ARCH="$(uname -m | sed -e 's/x86_64/amd64/' -e 's/\(arm\)\(64\)\?.*/\1\2/' -e 's/aarch64$/arm64/')" &&
  KREW="krew-${OS}_${ARCH}" &&
  curl -fsSLO "https://github.com/kubernetes-sigs/krew/releases/latest/download/${KREW}.tar.gz" &&
  tar zxvf "${KREW}.tar.gz" &&
  ./"${KREW}" install krew
)

# 追加 PATH 和 alias 到 .zshrc
cat >> ~/.zshrc <<'EOF'

# krew
export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"
alias k='kubectl'
alias kcm='kubecm'
alias kubecm='kubectl kc'
EOF

source ~/.zshrc

# 常用插件
kubectl krew install ctx ns cm kc
```

### helm

```bash
# 官方一键脚本，自动取最新稳定版
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

## 验收

```bash
kubectl version --client       # client 版本应与 env/versions.yaml 的 kubectl.current 一致
kubectl ctx                    # krew 插件 ctx 可用
kubectl ns                     # krew 插件 ns 可用
helm version                   # 输出 v3.x

# 需要 kubeconfig 的终验:
kubectl get nodes              # 应列出 gz / sg 两个节点
```

## 变更记录

- 2026-04-11 从 `env/dev.md` 拆出；明确 kubectl 与 k3s 的对齐策略；加 sha256 校验；保留原有 alias 链（`k` / `kcm` / `kubecm`）
