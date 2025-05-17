---
title: 在 PVE 中运行 Arch Linux
date: '2022-02-18'
lastmod: '2022-09-17'
tags: ['Arch Linux', 'Linux', 'PVE']
draft: false
summary: Arch Linux 的好，懂的都懂。这次在 PVE 中的 LCX 虚拟化了几个 Arch Linux 环境，用于跑一些服务和开发环境。本文主要分享了 Arch Linux 的配置步骤，其他方式入教的同志也可参考本文配置。
---

Arch Linux 准入门槛确实有点高，在 PVE 中，使用 LCX 容器运行 Arch Linux，似乎是一个不错的选择，难度比物理机安装低，就是资料也少了许多……不过，问题不大，毕竟最蛋疼的部分我们可以忽略掉了。前几个月还想着直接在树莓派上安装 Arch Linux，操作一波，太难了，时间有限，就没继续搞了(没有备用设备，折腾完怕是要旷工了)，最后还是再次给树每派安装了 Manjaro。

## 起步

### 0. 创建 LCX 容器

打开 Proxmox VE，选择你的宿主机，然后在界面右上角，点击“创建 CT”。
然后你就看着搞咯，创建这个没有像 OpenWRT 那样讲究。
值得注意的一点是，记得先在 PVE 中通过 `pveam` 更新并下载 Arch Linux 的模板 _([Proxmox Container Toolkit](https://pve.proxmox.com/pve-docs/chapter-pct.html#pct_container_images))_。
进入容器后，我们将以 `root` 用户登录。

### 1. 配置系统

位置(Location)
先编辑 `/etc/locale.gen`，取消 `en_US.UTF-8 UTF-8` 的注释。

```bash
sed -i "s/#en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/" /etc/locale.gen
```

然后执行：

```bash
locale-gen
```

语言：
然后创建文件 `/etc/locale.conf`，内容如下：

```ini
LANG=en_US.UTF-8
```

命令：

```zsh
echo 'LANG=en_US.UTF-8' > /etc/locale.conf
```

时区
查看当前时区：

```zsh
date +"%Z %z"
```

![image.png](https://notes.ivanli.cc/assets/image_1651218347929_0.png)
如果在中国大陆，那么执行以下命令：

```bash
ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
# 验证
date
# outputs:
# Sat Jan 15 23:26:18 CST 2022
```

### 2. 配置 pacman

我们知道 pacman 是 Arch Linux 自带的包管理器，系统到手，得先装点软件，毕竟 Arch Linux 比较简约。
首先配置 pacman 的源的镜像：

```bash
nano /etc/pacman.d/mirrorlist
```

选择你喜欢并且方便连接的镜像，然后删除该行的“#”取消注释。可以选择一个或多个，在前面的优先级高。

开启并行下载，在 `/etc/pacman.conf` 中取消 `ParallelDownloads` 前的注释，值为并行下载数：

```bash
sed -i "s/#ParallelDownloads = 5/ParallelDownloads = 5/" /etc/pacman.conf
```

接下来我们更新已安装的软件，我们的哲学就是时刻保持最新。

```bash
pacman -Syu
```

**一般来说，执行上面的命令后，会拉取索引数据库，之后会优先更新 `archlinuxx-keyring`。如果不是这样的话，应当手动执行下面的代码：**
初始化并刷新 pacman 的 keys。这个 key 是 pacman 的每个用户都拥有的，包括开发者和使用者。所以执行下面两条命令：

```bash
pacman-key --init
pacman-key --populate
pacman-key --refresh-keys
pacman -Sy archlinux-keyring
pacman -Syu
```

没执行上面步骤的，要手动一个个确认软件包开发者的签名……很蛋疼。如果遇到各种错误的话，可以执行下面几条命令后，再执行上面的命令：

```bash
pacman -Sc
pacman-mirrors -f0
rm -fr /etc/pacman.d/gnupg
```

_参考：[Cant Upgrade because of keyring - Technical Issues and Assistance / Package update process - Manjaro Linux Forum](https://archived.forum.manjaro.org/t/cant-upgrade-because-of-keyring/106893/10)_

### 3. 创建用户

首先，安装 `sudo`：

```bash
pacman -S sudo
```

让我们给自己分配一个具有 sudo 权限的账户

```zsh
useradd -m ivan
passwd ivan
usermod -aG wheel ivan
```

_参考：[Create a Sudo User on Arch Linux - Vultr.com](https://www.vultr.com/docs/create-a-sudo-user-on-arch-linux?__cf_chl_captcha_tk__=zPG_V_axFV3IH5lhY2j_1ChaaZgIcdPe_eYDPUOSouY-1642259505-0-gaNycGzNCZE)_
如果 `visudo` 找不到编辑器，那么可以执行：

```zsh
EDITOR=vim visudo
```

接下来使用刚刚创建的用户登录吧！

### 4. 使用 SSH 远程登录

先安装 OpenSSH：

```bash
sudo pacman -S openssh
```

然后启用并启动：

```bash
sudo systemctl enable sshd
sudo systemctl start sshd
```

接下来就可以在其他机子上以刚刚的用户通过 ssh 访问了。

### 5. 安装 Yay

安装 AUR 上的软件，怎么少得了 [[yay]] 呢？安装 Yay 需要切换到非 root 账户。

```bash
sudo pacman -S git
sudo pacman -S --needed base-devel
# 上面的命令有选装的项目，简单起见，全都装上

git clone https://aur.archlinux.org/yay.git
cd yay
makepkg -si
```

### 6. Zsh

安装 Zsh

```shell
yay -Sy zsh-git
```

安装 Zinit 和我常用的插件

```shell
sh -c "$(curl -fsSL https://git.io/zinit-install)"

echo 'zinit load zsh-users/zsh-syntax-highlighting
zinit load zsh-users/zsh-autosuggestions
zinit load  ael-code/zsh-colored-man-pages
zinit load agkozak/zsh-z
zinit ice depth=1; zinit light romkatv/powerlevel10k' >> ~/.zshrc
```

然后进入到 `zsh` 中，执行一次 `source ~/.zshrc`：

```shell
zsh

source ~/.zshrc
```

设置 Zsh 为默认的 shell 程序：

```bash
# 列出所有已安装的 shell 程序
chsh -l
# 从上面的结果中找到 zsh 的完整路径
# 我的是 /bin/zsh
chsh -s /bin/zsh
```

### 7. Docker

安装 Docker 也很简单：

```bash
yay -S docker
# 启动
sudo systemctl start docker
# 启用
sudo systemctl enable docker
# 安装 Compose
yay -S docker-compose
# 添加当前用户到 docker 组
sudo usermod -aG docker $USER
# log in to a new group
newgrp docker
```
