---
title: 使用 Xray、acme.sh、Docker Compose 搭建内网穿透服务
date: '2022-06-11'
tags: ['xray', 'acme', 'acme.sh', 'docker', 'docker compose', '内网穿透']
draft: false
summary: 为了能在外直接访问家中网络，我组建了三套方案，一是 [[Xray]]，二是 [[ZeroTier]]，三是 [[NPS]]。今天，我准备在我上个月购入的服务器上再部署一套 Xray 服务，提高可用性。本次准备完全仰仗 Docker 容器，让我未来迁移服务更加省事。
---

## 简介

为了能在外直接访问家中网络，我组建了三套方案，一是 [Xray](/tags/xray)，二是 [ZeroTier](/tags/zerotier)，三是 [NPS](/tags/nps)。今天，我准备在我上个月购入的服务器上再部署一套 Xray 服务，提高可用性。本次准备完全仰仗 Docker 容器，让我未来迁移服务更加省事。

## 目标与方案

个人自用，成本得控制到零(bushi)，安全性还是得做得好些，所以选用 Xray 来承载功能，使用免费的 TLS CA 来签发证书。由于免费的证书一般有效期比较短 (常见的是 90 天)，所以还需要实现自动续签。
Let's Encrypt 和 acme.sh 是不错的组合。不过听说 Let's Encrypt 被收购了，不知道是否有安全风险，未来需要再确认下。由于财力并不雄厚，考虑到未来可能服务会”流离失所“，用容器方案比较好迁移。

## 技术栈

- Xray
  一款支持加密传输、内网穿透的网络工具。由 GoLang 编写，支持很多平台。
  _官方站点：[Project X](https://xtls.github.io/)_
- acme.sh
  用于签发 TLS 证书。顾名思义，支持 ACME 协议签发、自动续签证书的脚本。
  _官方站点：[acmesh-official/acme.sh](https://github.com/acmesh-official/acme.sh)_
- Caddy
  用于反向代理部署在家里的 Web 服务。它是现代的反向代理服务。
  _官方站点：[Caddy 2](https://caddyserver.com/v2)_
- Docker Compose
  众所周知？

## 搭建步骤

### Docker Compose

首先需要拥有并运行 Docker 和 Docker Compose。
创建一个用于存放配置文件目录，并进入该目录。
创建 Compose 配置文件：

```bash
touch docker-compose.yml
vim docker-compose.yml
```

文件内容：

```yaml
version: '3.9'

networks:
 caddy:
 name: caddy
 xray:
 name: xray

volumes:
 caddy-data:
 name: caddy-data
 caddy-config:
 name: caddy-config
 acme-sh-data:
 name: acme-sh-data

services:
 caddy:
   image: caddy:2
   container_name: caddy
   restart: always
   ports:
     - 80:80
     - 443:443
   networks:
     - caddy
   volumes:
     - $PWD/caddy/Caddyfile:/etc/caddy/Caddyfile
     - $PWD/site:/srv
     - caddy-data:/data
     - caddy-config:/config

 xray:
		image: teddysun/xray
		container_name: xray
		restart: always
		networks:
     - xray
     - caddy
		ports:
		  - 3332-3334:3332-3334
		volumes:
		  - ./xray:/etc/xray
		  - acme-sh-data:/certs
		command: "xray -c=/etc/xray/config.yml"

 acme.sh:
		image: neilpang/acme.sh
		container_name: acme.sh
		#  restart: always
		volumes:
		  - acme-sh-data:/acme.sh
		env_file: acme.env
		command: "daemon"

```

### 签发证书

使用 DNS Challenge 来签发证书，所以需要 DNS 服务商的 API 来实现自动化签发流程。

以阿里云举例：

1. 创建 RAM 子账户，并只允许访问 API；
2. 复制 key 和 secret；
3. 为 RAM 子账户授权 DNS 解析的管理权限。

在当前目录创建 `acme.env` 文件：

```zsh
touch acme.env
vim acme.env
```

文件内容：

```zsh
Ali_Key="sdfsdfsdfljlbjkljlkjsdfoiwje"
Ali_Secret="jlsdflanljkljlfdsaklkjflsa"
```

启动 compose 服务：

```zsh
docker-compose up -d
```

前面我们启动了刚刚创建的 compose 服务，现在，我们使用 `acme.sh` 容器运行以下命令签发证书：

```zsh
docker exec acme.sh acme.sh --log --issue --dns dns_ali --server letsencrypt -d ivanli.cc -d "*.ivanli.cc"
```

签发成功后你将会在输出末尾看到如下内容：
![签发成功时，程序输出图示](https://notes.ivanli.cc/assets/image_1654257070519_0.png)

注意，签发通配符证书时，需要一次性将所有通配的子域都写在同一条命令上，使用 `-d` 参数追加。

### 配置 Xray

因为前面挂载了 `acme.sh` 的数据卷，所以默认的证书位于 `/certs/ivanli.cc/` 目录下。证书要使用 `fullchain` 的，避免证书链不完整，导致客户端连接验证失败。

创建 Xray 配置文件：

```zsh
mkdir ./xray
vim ./xray/config.yml
```

内容如下：

```yml
inbounds:
  # listening for host-name.home
  - tag: host-name.home.in
    listen: 0.0.0.0
    port: 3332
    protocol: vless
    settings:
      clients:
        - id: <uuid> # 你的 UUID
          flow: xtls-rprx-direct
      decryption: none
    streamSettings:
      network: tcp
      security: xtls
      xtlsSettings:
        serverName: ivanli.cc
        alpn:
          - http/1.1
        certificates:
          - certificateFile: /certs/ivanli.cc/fullchain.cer
            keyFile: /certs/ivanli.cc/ivanli.cc.key

  # reverse ssh to host-name.home
  - tag: ssh.host-name.home.in
    listen: 0.0.0.0
    port: 3334
    protocol: dokodemo-door
    settings:
      network: tcp
      address: 127.0.0.1
      port: 22
  # reverse http to 101.home
  - tag: http.host-name.home.in
    listen: 0.0.0.0
    port: 3333
    protocol: dokodemo-door
    settings:
      network: tcp
      address: 127.0.0.1
      port: 80

outbounds:
  - protocol: freedom
    tag: direct
  - tag: blocked
    protocol: blackhole

reverse:
  portals:
    - tag: host-name.home.portal
      domain: host-name.home.reverse

routing:
  - type: field
    inboundTag:
      - ssh.host-name.home.in
      - http.host-name.home.in
    outboundTag: host-name.home.portal
  - type: field
    domain:
      - full:host-name.home.reverse
    outboundTag: host-name.home.portal
```

配置说明

- `3332` 端口用于客户端连接服务端；
- `3333` 端口用于 HTTP 穿透，映射了 `server:3333 <--> client:80` 端口；
- `3334` 端口用于 SSH 穿透。
- 如果需要连接更多的内网主机和端口，可以继续依葫芦画瓢地加。

### 配置 Caddy

为了让我们的 Web 站点能够公开到互联网，并且增强可控性，没有直接公开 Xray 的端口，而是使用 Caddy 反向代理 Xray 的穿透的本地端口。

创建 Caddy 配置文件：

```zsh
mkdir ./caddy
vim ./caddy/Caddyfile
```

内容如下：

```caddyfile
{
  servers {
    protocol {
      allow_h2c
    }
  }
  admin off
}

any-service.ivanli.cc, another-service.ivanli.cc {
  reverse_proxy http://localhost:3333
}
```

端口 `3333` 是 Xray Server 映射家里 HTTP 服务的端口，所以我们这里反向代理服务器上的 3333 端口就好了。

因为 Caddy 会自动从 CA 签发证书，所以这里不需要我们手动配置证书。

配置完成后，重启服务就好

```zsh
docker-compose restart
```

现在，你拥有一个安全的内网穿透服务了~
用户通过 HTTPS 协议访问服务器，服务器通过 TLS 加密连接与内网主机通讯。
TODO 自动重启
