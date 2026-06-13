# 2026-05-16 NUC 关闭 Ubuntu 自动更新提示

- 日期：2026-05-16
- 变更人：Codex
- 状态：Done
- 关联文档：[`infra/08-NUC家庭软路由（mihomo）.md`](../08-NUC家庭软路由（mihomo）.md)

## 1. 目的与范围

- 目的：NUC 作为家庭软路由节点，关闭 Ubuntu 桌面升级弹窗和后台自动 apt 定时任务，改为人工择时升级。
- 影响范围：`nuc` 宿主机。
- 预期停机/抖动：无，不重启系统，不重启 `mihomo`。

## 2. 风险评估

- 主要风险：关闭自动检查后，安全更新不会主动提示，需要人工定期维护。
- 缓解措施：保留 `apt` 手动升级能力；在软路由文档中记录恢复命令。

## 3. 变更前检查

- `ssh NUC true`：可登录。
- `kubectl get nodes -o wide`：`nuc` 为 `Ready`。
- `apt-daily.timer` / `apt-daily-upgrade.timer`：变更前为 `enabled` 且 `active`。

## 4. 变更内容

1. 关闭并 mask apt 自动任务：

   ```bash
   sudo systemctl disable --now apt-daily.timer apt-daily-upgrade.timer
   sudo systemctl mask apt-daily.timer apt-daily-upgrade.timer apt-daily.service apt-daily-upgrade.service
   ```

2. 关闭发行版升级提示：

   ```bash
   sudo cp /etc/update-manager/release-upgrades /etc/update-manager/release-upgrades.bak.codex-<timestamp>
   sudo sed -i 's/^Prompt=.*/Prompt=never/' /etc/update-manager/release-upgrades
   ```

3. 关闭当前用户的图形更新通知器自启动：

   ```bash
   mkdir -p ~/.config/autostart
   cp /etc/xdg/autostart/update-notifier.desktop ~/.config/autostart/update-notifier.desktop
   sed -i 's/^X-GNOME-Autostart-enabled=.*/X-GNOME-Autostart-enabled=false/' \
     ~/.config/autostart/update-notifier.desktop
   ```

## 5. 验证

执行位置：本地通过 `ssh NUC`。

```text
systemctl is-enabled apt-daily.timer apt-daily-upgrade.timer apt-daily.service apt-daily-upgrade.service
masked
masked
masked
masked

systemctl is-active apt-daily.timer apt-daily-upgrade.timer apt-daily.service apt-daily-upgrade.service
inactive
inactive
inactive
inactive

grep -E '^Prompt=' /etc/update-manager/release-upgrades
Prompt=never

grep -E '^X-GNOME-Autostart-enabled=' ~/.config/autostart/update-notifier.desktop
X-GNOME-Autostart-enabled=false

apt --version
apt 2.8.3 (amd64)
```

## 6. 回滚

```bash
sudo systemctl unmask apt-daily.timer apt-daily-upgrade.timer apt-daily.service apt-daily-upgrade.service
sudo systemctl enable --now apt-daily.timer apt-daily-upgrade.timer
sudo sed -i 's/^Prompt=.*/Prompt=lts/' /etc/update-manager/release-upgrades
sed -i 's/^X-GNOME-Autostart-enabled=.*/X-GNOME-Autostart-enabled=true/' \
  ~/.config/autostart/update-notifier.desktop
```

## 7. 结果与后续

- Ubuntu 自动更新 timer 已关闭并 mask。
- 发行版升级提示已关闭。
- 当前用户桌面更新通知自启动已关闭。
- 后续升级通过 `sudo apt update && sudo apt upgrade` 人工执行。
