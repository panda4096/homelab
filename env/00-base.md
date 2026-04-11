# 00-base — Linux 节点基础 shell 环境

## 适用场景

新建一台 Ubuntu 22.04+ 节点，用作 homelab 节点或 dev 跳板。

## 前置依赖

无。这是最底层的一份。

## 版本策略

本节工具全部使用系统包管理器或上游安装脚本的最新版，**不 pin 版本**。

## 安装步骤

```bash
sudo apt update
sudo apt install -y zsh git curl jq

# oh-my-zsh 官方安装脚本（取 master 最新）
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# 改默认 shell（会提示输入当前用户密码）
chsh -s "$(which zsh)"
```

改完后**退出当前 SSH session 重新登录**，新 shell 生效。

> 注意：不要用 `pkill -KILL -u $USER` 刷新 session——那会把当前 SSH 进程也杀掉，远程装机时可能断连登不回来。

## 验收

```bash
echo "$SHELL"          # 期望: /bin/zsh 或 /usr/bin/zsh
zsh --version          # 能输出版本号即可
ls -la ~/.oh-my-zsh    # 目录存在
jq --version           # 后续 golang / k8s-client 脚本会用到
```

## 变更记录

- 2026-04-11 从 `env/dev.md` 拆出；移除 `pkill -KILL` 危险命令；把 `jq` 加入基础依赖（后续查询版本需要）
