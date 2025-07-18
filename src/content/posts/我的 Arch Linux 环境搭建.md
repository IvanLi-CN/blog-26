---
publishDate: 2021-12-13T00:00:00Z
title: 我的 Arch Linux 环境搭建
---

# 我的 Arch Linux 环境搭建

树莓派跑图形界面还是多少有点多余，而且桌面环境似乎还影响了部分功能，这次从 Manjaro 迁移到 Arch Linux，又到了环境搭建的环节，让我们继续玩耍吧。这次的目标就是搭建一个软路由 + 数据库 + Node.js 的运行环境。

## 基建

### 创建用户

```shell
useradd web
usermod -aG wheel web
```

执行完毕后，我们将得到一个具有 home 目录的用户 `web`，随后赋予了 `web` 用户 su 的权限。

*`wheel` 是 Arch Linux 默认的管理员组。

执行以下命令，为 `web` 用户设置密码：

```shell
passwd web
```

### 安装 AUR 包管理器：Yay

```shell
pacman -S --needed git base-devel go
git clone https://aur.archlinux.org/yay.git
cd yay
makepkg -si
```

### “连接互联网”：Xray

```shell
yay -S xray
```

选择 `xray`，安装成功后，配置文件位于 ` /etc/xray/` 目录下，或者你也可以放置在 `/usr/local/etc/xray/` 目录下。

启动服务：`sudo systemctl start xray`；

自启动：`sudo systemctl enable xray`；

### 配置 ZSH

安装 ZSH：

```shell
yay zsh
```

安装 Zinit 和我常用的插件

```shell
sh -c "$(curl -fsSL https://raw.githubusercontent.com/zdharma/zinit/master/doc/install.sh)"
echo 'zinit load zsh-users/zsh-syntax-highlighting
zinit load zsh-users/zsh-autosuggestions
zinit load  ael-code/zsh-colored-man-pages
zinit load agkozak/zsh-z
zinit ice depth=1; zinit light romkatv/powerlevel10k' >> ~/.zshrc
```

### 配置

