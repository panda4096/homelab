# 01-golang — Go 工具链

## 适用场景

- homelab 节点上需要跑 Go 写的工具
- dev 机器上写 Go 代码

## 前置依赖

- `00-base.md` 已完成（需要 zsh、curl、jq）

## 版本策略

**默认不 pin，使用最新稳定版。**

查询最新稳定版：

```bash
curl -sSL "https://go.dev/dl/?mode=json" | jq -r '.[0].version'
# 输出形如: go1.23.5
```

**需要 pin 的情况**：某个项目的 `go.mod` 声明了最低 Go 版本（例如 `go 1.22`），或你想统一多台机器的版本。此时在 `env/versions.yaml` 里新增一项 `golang`：

```yaml
golang:
  constraint: "项目 X 的 go.mod 要求 1.22+"
  current: "go1.23.5"
  last_verified: "YYYY-MM-DD"
```

查某个 minor 的最新补丁版（例如 1.23.x）：

```bash
curl -sSL "https://go.dev/dl/?mode=json&include=all" \
  | jq -r '[.[] | .version] | map(select(startswith("go1.23."))) | .[0]'
```

## 安装步骤

```bash
# 1. 选定版本
#    默认: 取最新稳定版
GO_VERSION="$(curl -sSL "https://go.dev/dl/?mode=json" | jq -r '.[0].version')"
#    如果 env/versions.yaml 里 pin 了, 就手动覆盖:
#    GO_VERSION="go1.23.5"

# 2. 识别架构
OS="$(uname | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m | sed -e 's/x86_64/amd64/' -e 's/aarch64/arm64/')"
TARBALL="${GO_VERSION}.${OS}-${ARCH}.tar.gz"

# 3. 下载 + sha256 校验
cd /tmp
curl -fsSLO "https://go.dev/dl/${TARBALL}"
EXPECTED_SHA="$(curl -fsSL "https://go.dev/dl/?mode=json&include=all" \
  | jq -r ".[] | select(.version==\"${GO_VERSION}\") | .files[] | select(.filename==\"${TARBALL}\") | .sha256")"
echo "${EXPECTED_SHA}  ${TARBALL}" | sha256sum -c -

# 4. 安装到用户目录（先删旧版再解压, 保证干净）
mkdir -p "$HOME/softwares"
rm -rf "$HOME/softwares/go"
tar -C "$HOME/softwares" -xzf "${TARBALL}"
```

## 环境变量

追加到 `~/.zshrc`：

```bash
cat >> ~/.zshrc <<'EOF'

# golang
export GOROOT="$HOME/softwares/go"
export GOPATH="$HOME/workspace/gopath"
export GOBIN="$GOPATH/bin"
export PATH="$PATH:$GOROOT/bin:$GOBIN"
EOF

source ~/.zshrc
```

## 验收

```bash
go version             # 输出应包含刚装的版本号
go env GOROOT          # 应指向 $HOME/softwares/go
go env GOPATH          # 应指向 $HOME/workspace/gopath
which go               # 应在 $GOROOT/bin 下
```

## 变更记录

- 2026-04-11 从 `env/dev.md` 拆出；加 sha256 校验、架构自适应、版本自动查询；去掉硬编码的 `/home/ubuntu` 路径
