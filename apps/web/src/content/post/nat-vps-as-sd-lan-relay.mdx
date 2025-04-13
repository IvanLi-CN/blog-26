---
title: 使用 NAT VPS 作为 SD-WAN 中继
date: '2022-10-13'
tags: ['ZeroTier', 'TailScale', ‘SD-WAN’, 'NAT', 'VPS', 'FRP', 'Self-Hosted']
draft: false
summary: ZeroTier 和 TailScale 是我目前正在同时使用的 SD-WAN 组网工具。这次购入了一台 NAT VPS，准备用它中继 ZeroTier 和 TailScale。
---

## 诉苦

由于工作需要，我已经好几个月使用 SD-WAN 在公司和宿舍组建了 SD-WAN，可是国内网络环境实在是不友好，公司网络质量也差，我忍受了很久的随机掉线的问题，近两个月我改用手机热点避免了这个问题，但是只能在开发后端时使用，如果开发前端或者是对生产环境进行部署与验证时，访问线上环境需要几百兆流量，我吃不消哇，频繁切换 Wi-Fi 接入点也不是个令人愉快的事。但天无绝人之路，我兜兜转转购入了一台香港的 NAT VPS，规划用于中继 SD-WAN。

## 方案

## 步骤

### 重装系统

// TODO:

## ZeroTier 中继

### VPS 上安装步骤

#### 安装 ZeroTier 客户端

```bash
yay -S zerotier-one
```

#### 启动服务

```bash
sudo systemctl enable zerotier-one
sudo systemctl start zerotier-one
```

#### 加入网络

打开官方 planet 面板：[ZeroTier Central](https://my.zerotier.com/)，复制你的网络 ID，然后：

```bash
sudo zerotier-cli join <your_network_id>
```

回到面板，授权刚刚加入的节点。

#### 转换为 Moon

生成 moon 配置

```bash
sudo zerotier-idtool initmoon identity.public | sudo tee -a  moon.json
```

输出示例：

```json
{
  "id": "9axxxxxx12",
  "objtype": "world",
  "roots": [
    {
      "identity": "9axxxxxx12:0:258xxxxxx38b34a2fa88b46d290137a6ecb3a185dacdaee957c30e33f1977ca7e",
      "stableEndpoints": []
    }
  ],
  "signingKey": "df18369fxxxxxx70036a356c",
  "signingKey_SECRET": "b1524155faa6f779b8xxxxxxf811f711fed",
  "updatesMustBeSignedBy": "df18369f3b54xxxxxx036a356c",
  "worldType": "moon"
}
```

向 `"stableEndpoints": []` 中添加 `"<server_ip>/<server_nat_port>"`，其中 `server_ip` 是你的公网地址，`server_nat_port` 是 NAT 后的外网端口。示例如下：

```json
{
  //...
  "roots": [
    {
      "identity": "9axxxxxx12:0:258xxxxxx38b34a2fa88b46d290137a6ecb3a185dacdaee957c30e33f1977ca7e",
      "stableEndpoints": ["1.2.3.4/19993"]
    }
  ]
  //...
}
```

生成 `.moon` 文件：

```bash
sudo zerotier-idtool genmoon moon.json
```

执行完成后，可以在当前目录中看到 `.moon` 文件：

```bash
ls -l | grep *.moon
```

将生成的 `.moon` 文件移动到 `./moons.d` 目录中：

```bash
sudo mkdir moons.d
sudo mv 000000xxxxxxxxxx.moon moons.d
```

#### 重启 ZeroTier 服务

```bash
sudo systemctl restart zerotier-one
```

### 使用 ZeroTier 中继

前面生成的 "000000xxxxxxxx.moon" 文件，除去后缀 `.moon` 外就是 Moon ID，前面的零没啥用，把后面的内容放到下面的命令中，两个参数都是 Moon ID。

```bash
 sudo zerotier-cli orbit xxxxxxxxxx xxxxxxxxxx
```

### 问题排查

#### 无法加入网络

```bash
sudo zerotier-cli join xxxxxxxxxxxx
# outputs:
# zerotier-cli: missing port and zerotier-one.port not found in /var/lib/zerotier-one
```

原因：没有[启动服务](#启动服务)。

#### 无法初始化 moon

```bash
 sudo zerotier-idtool initmoon identity.public | sudo tee -a  moon.json
# outputs:
# identity.public is not a valid identity
```

原因：没有[启动过服务](#启动服务)。第一次启动后 ZeroTier 会创建 `identity.public` 文件。
