---
publishDate: 2021-08-07T00:00:00Z
title: Arch Linux ARM 入教指南（RPI  4B 为例）
---

# Arch Linux ARM 入教指南（RPI  4B 为例）

从前，我是半个（甚至可能不被未来的我承认）Arch 教徒。现在，我要正式入教了。Arch 拥有非常庞大、特别新鲜的软件包，从 Manjaro 过来的我，表示十分舒服。年初装的 Manjaro ARM 好像一直没办法成为一个软路由的操作系统，教程都摸烂了还是成功不得，这次，换系统 + 迁移数据，希望能够给我带来惊喜。

## 准备系统盘

### 事前念叨

Arch Linux ARM 发布的镜像是没办法使用树莓派官方提供的镜像烧录工具进行烧录，所以需要手动处理了。原则上只要系统支持格式化分区为 `ext4` 格式，应该都是能做系统盘的，以上个人推测，具体行不行，在下梅开二度时再验证了~。

目前**推荐在 Linux 下操作**，我没有别的 Linux 设备了（黑、白苹果真舒服），那就让需要重装系统的树莓派代劳了。

### 一、下载镜像

镜像位于 https://archlinuxarm.org/about/downloads，请根据自己的硬件选择合适的镜像。RPI 4B 镜像地址：http://os.archlinuxarm.org/os/ArchLinuxARM-rpi-aarch64-latest.tar.gz

### 二、磁盘分区

本小节需要完成四个步骤：

1. 插入／连接你的存储设备；
2. 要找到你的存储设备的 ID；
3. 重新分区；
4. 格式化磁盘。

首先，连接需要被做成系统盘的存储设备，对于从 Micro SD 卡启动的树莓派来说，需要将 Micro SD 卡使用读卡器连接到 Linux 电脑。之后在终端执行如下命令，获取所有磁盘信息。

``` shell
fdisk -l
```

你将会看到很多的磁盘（disk），找到对应的磁盘 ID，类似于 `/dev/sdb`。注意，不是驱动器（device）,驱动器 ID 类似于 `/dev/sdb1`，请注意甄别。

之后，你便可以开始对磁盘进行重新分区了。接下来我将以 ` /dev/sdb` 来执行命令。（对了，我没有截图，现在只能简单地复盘了，图片的话，下次一定）

``` shell
fdisk /dev/sdb1
```

上面的命令能让你进入交互式的操作。接下来我们要进行如下操作来划分两个分区：

1. 输入 `o`，清除原有的分区；

2. 输入 `p`，显示目前的分区情况，检查分区时候被清除；

3. 输入 `n`，然后再输入 `p`，创建一个主分区（primary）：

   1. 选择分区 `1`；
   2. 敲击 `ENTER`，使用默认的起始扇区（一般是 2048）；
   3. 输入 `+100M`，给这个分区划分 100 M 的空间；
   4. 输入 `t`，设置分区格式，再输入 `c` 将分区设为 `W95 FAT32 (LBA)`  格式。

4. 输入 `n`，然后再输入 `p`，再创建一个主分区：

   1. 选择分区 `2`；
   2. 敲击两次 `ENTER`，使用默认的起始和结束扇区（接着分区 1 后面并使用剩余的所有扇区）；

5. 输入 `w`  写入当前配置的分区表（只有执行了这条才能始配置生效，中途退出则不生效）。

   如果遇到重新读取（`Re-Reading`）磁盘信息失败，请按提示信息手动执行命令以重新加载。比如，我执行的是 `partprobe`。

接下来，我们格式化刚刚分出来的两个分区。

```shell
mkfs.vfat /dev/sdb1
mkfs.ext4 /dev/sdb2
```

### 写入引导文件和系统文件

经过前面的步骤，我们有了系统镜像和两个分区，分区一用来放引导文件，分区二用来放系统文件。

首先挂载前面的两个分区：

```shell
mkdir root
mkdir boot
mount /dev/sdb1 boot
mount /dev/sdb2 root
```

然后解压镜像文件到 root，并将 `<root>/boot/` 中的文件全部移动到 `boot/` 目录中：

``` shell
bsdtar -xpf ArchLinuxARM-rpi-aarch64-latest.tar.gz -C root
sync
mv root/boot/* boot
```

对于我的树莓派而言，我的 `boot` 分区由 device `/dev/mmcblk1p1` 挂载到 `/boot` 路径上，所以我需要执行如下命令来替换默认的 device：

```shell
sed -i 's/mmcblk0/mmcblk1p1/g' root/etc/fstab
```

如果你不知道，可以到时候进系统了再改，我是进系统了之后改的，没改之前会需要一分三十秒的等待来等这个 device 加载超时。似乎还影响一些指令的执行。

最后，卸载然后拔掉你的存储设备：

```shell
umount boot root
rmdir boot
rmdir root
```

## 初始化配置

### 开机

插入 Micro SD Card，通电开机。然后等设备询问你账号和口令。登录 `root` 账户，默认密码为 `root`。（普通默认账号为 `alarm`，密码为 `alarm`。 alarm 代表 “Arch Linux ARM”）。

### 设置时区

`timedatectl set-timezone Asia/Shanghai`，将时区设为上海所在的东八区。

可用的地区可以在 `/usr/share/zoneinfo` 目录内查看。

### 设置时钟（有 RTC 模块的才需要）

`timedatectl set-ntp true`

### 设置语言

`vi /etc/locale.gen`，使用 `?` 搜索你想要的语言，并将其开头的 `#` 删除。使用多个语言的，可以选多个。

vi 光标移动： jhlk，删除当前位置： x。或者使用 nano，系统有自带。

然后执行代码：`locale-gen`。

最后设置你的语言：`localectl set-locale LANG=en_US.UTF-8`

### 设置 Hostname

先设置 Hostname `hostnamectl set-hostname <name>`。

然后在 `/etc/hosts` 设置下 Hostname 对应的地址：

```plain
127.0.0.1		localhost.localdomain	myhostname	localhost
::1					localhost.localdomain	myhostname	localhost
```

### 设置 Pacman 输出为彩色

```shell
sed -i 's/#Color/Color/' /etc/pacman.conf
```

### 更新一波

```shell
pacman-key --init
pacman-key --populate archlinuxarm
pacman -Syu
```

### 重启

```shell
reboot
```

## 常见问题

### 执行某些命令时遇到 `Failed to connect to bus` 错误

boot 分区挂载失败，手动挂载下。通过输入 `disk -f` 查看 boot 分区所在驱动器，将其替换到 `/etc/fstab` 中，比如我的 RPI 4B 使用 Micro SD Card 启动，则替换为 `/dev/mmcblk1p1`：

```shell
# Static information about the filesystems.
# See fstab(5) for details.

# <file system> <dir> <type> <options> <dump> <pass>
/dev/mmcblk1p1  /boot   vfat    defaults        0       0
```



### 参考资料

1. [Arch Linux ARM 下载](https://archlinuxarm.org/about/downloads)
2. [How to Install Arch Linux on a Raspberry Pi 4 [Step-by-step Tutorial for Beginners]](https://itsfoss.com/install-arch-raspberry-pi/)

