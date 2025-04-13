---
title: 利用 SNI 路由 TLS 连接实现端口复用
date: '2022-09-08'
tags: ['SNI', 'TLS', 'Reverse Proxy', '反向代理', 'Caddy', 'Xray', 'Vless']
draft: false
summary: 通过 SNI 反向代理，实现 VLESS 与 Web 站点共享 443 端口。
---

## 前言

这次的目标是通过 TLS 的 SNI 来实现对 TLS 连接的路由，以实现 SD-WAN 中的 VLESS 连接与 HTTPS 连接复用 443 端口。
如此一来，我在外访问家庭网络内的非 Web 服务时，能够很轻松地通过防火墙，因为 443 端口作为 HTTPS 默认端口，并且通过 VLESS 隧道访问的流量特征与 HTTPS 流量特征相同，有效避免被误杀。

### 试错

因为苦 Nginx 久矣，所以我近一年来都在用 Caddy 2，而这次也是因为 Caddy 2 生态不够强大，所以绕了一圈。

#### Caddy 反向代理 Xray

Caddy 标准版本不提供 TCP 或 TLS 反向代理的能力，但是它有一个非官方的模块支持四层反向代理——[mholt/caddy-l4: Layer 4 (TCP/UDP) app for Caddy](https://github.com/mholt/caddy-l4)。
Caddy L4 支持 TCP 和 UDP 反向代理。但是，它目前为止还不支持 Caddyfile 配置，只能通过 JSON 配置。这就不友好了，我也就干脆地放弃这方案了。

#### Xray 反向代理 Caddy

Xray 的 VLESS 协议支持[回落](https://xtls.github.io/Xray-docs-next/document/level-1/fallbacks-with-sni.html)功能，能让非 VLESS 连接传递给后备服务。将 Caddy 作为后被服务，则能让 HTTPS 连接交由 Caddy 处理。

这个方案还行，首先，流量特征与 Caddy 差异小，这得益于都是 Go Lang 开发的程序；其次是性能损耗也可接受。唯一的问题就是，签发的泛域名证书只是 `*.ivanli.cc`，所以 443 端口只能部署 `*.ivanli.cc` 的站点，部署主域或者三级域名之类的站点将会报证书错误。所以这个方案也 pass 掉了。

### 在 Caddy 和 Xray 之前路由

使用一个支持 TLS SNI 路由的程序将连接按 SNI 反向代理到 Caddy 或 Xray 中。这个方案没啥局限性，就是浪费了些性能，增加了些延迟。我能接受，毕竟咱有追求不是？

那接下来就用这个方案来实现，那个路由就由 SNI-Proxy 来实现。

## 技术栈

### SNI Proxy

[dlundquist/sniproxy](https://github.com/dlundquist/sniproxy) 是一款支持对 HTTP 和 TLS 连接按虚拟主机名转发流量的反向代理程序。
对于 TLS 连接，它通过 SNI 进行区分并按规则转发到对应的端口，并不需要对 TLS 进行解密。并且它支持 HAProxy 代理协议将原始源地址传递给后端。

### VLESS

VLESS 是一种安全高效的数据传输协议，其支持的 xTLS 协议非常适合作为网络隧道传递 TLS 数据，能够极大地降低网关计算资源。

### Caddy

一款现代的 HTTP 反向代理程序。

## 部署步骤

使用 Docker Compose 部署。

以下是用到的容器：

- [caddy - Official Image | Docker Hub](https://registry.hub.docker.com/_/caddy)
- [tommylau/sniproxy - Docker Image | Docker Hub](https://registry.hub.docker.com/r/tommylau/sniproxy)
- [neilpang/acme.sh - Docker Image | Docker Hub](https://registry.hub.docker.com/r/neilpang/acme.sh)
- [gists/xray - Docker Image | Docker Hub](https://registry.hub.docker.com/r/gists/xray)

部署方式：[利用一台小鸡实现网络自由](./network-freedom-with-vps)
