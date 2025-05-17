---
publishDate: 2021-09-14T00:00:00Z
title: 开发一个 API Gateway
---

# 开发一个 API Gateway

## 前言

之前一直以为 PM2 能够实现零停机发版的，现在发现似乎不行……那就只能用经典的招数来解决这个问题了——蓝绿部署。目前，微服务当道，我自己也在研究多服务 / 微服务相关的东西，网关早就进入了我的视野。这次就让我来开发一只简单的 API 网关吧。

## 前置知识

### 蓝绿部署

蓝绿部署主要是为了减少新版本发布的过程中导致服务暂停的时间。一般来说，蓝绿部署会将新版程序运行起来后，将流量切换到新版程序，之后等待旧版程序完成之前的工作后，再将旧版程序关闭。这样就能达到零停机更新了。

如果服务是以集群形式运行的话，那可以使用**滚动发布**。滚动发布是指对集群中的每个程序进行蓝绿部署。这样资源消耗会比较少。

### API 网关

API 网关（API Gateway），就和网络工程中的网关差不多，核心功能是实现数据转发。数据转发其实就是代理，API 网关是一个反向代理服务，提供了聚合接口、实现 API 所需的通用功能。常见的通用功能有用户身份验证、速率限制、统计、日志等。

这次我开发 API 网关的动机仅仅是为了实现蓝绿部署，所以其他的功能就先不实现了哈，等后面其他服务写完了再回来完善（不知要过多少个春夏秋冬）。

这次实现的 API 网关也只做了 HTTP 和 WebSocket 的适配，其他的暂时没遇到，就先不管了。我的服务也主要是 Web 服务，后面有需要了再加吧。

## 开发步骤

项目使用 Node.js + TypeScript 开发，Node.js 的并发能力大家也是有概念的，作为网关性能瓶颈一般不会出在 Node.js 上。

项目分为三个部分，一是上游服务在网关的映射关系，二是实现 HTTP 的反向代理，三是实现 WebSocket 的反向代理。

### 上游服务映射

这个就不是什么重点内容了，这次我直接从 etcd 中读取相关数据后，整理出映射关系，并提供了一个 Service 类来提供关系查找。

### HTTP 代理

项目采用 `fastify` 作为 HTTP 服务框架，配合 `fastify-reply-from`，就轻松地实现了 HTTP 反向代理。

嗯，没了。代码没几行：

``` typescript
this.httpServer.all("/*", async (request, reply) => {
  const [host] = request.hostname.split(":");
  const from = this.vHostMap.getUpstream(host, request.url);
  if (from) {
    return reply.from(from.toString());
  }

  return reply.code(502).send("upstream not found");
});
```



### WebSocket 代理

在下没找到合适的 WebSocket 反向代理的轮子，因为后期还是要完善这个网关的，也不能用太低级（Low-level）的轮子，所以直接使用了 `ws` 来实现这个功能。

其实和 HTTP 反向代理的做法差不多，只是多一个步骤——需要手动转发事件给 source socket 和 upstream socket。

``` typescript
source.on("message", (data, binary) => upstream.send(data, { binary }));
upstream.on("message", (data, binary) => source.send(data, { binary }));

// ping, pong, close ...
```

## 关键点

### WebSocket 的请求头和响应头

开发过程中，不要图方便直接转发 source client 发来的 headers 到 upstream server。否则你将遇到下面这样的错误：

``` text
  1011 Invalid Sec-WebSocket-Accept header
```

这主要是我们是在 WebSocket 协议栈上创建了一对中间 socket，所以并不能直接将某些标头转发给 upstream server。具体原因我猜测是覆盖了原有一些标头导致校验不匹配，实际情况我还没验证（懒惰-ing）

我们知道，WebSocket 协议是从 HTTP 协商升级（upgrade）成功后才能建立的。那协商是从握手开始的。首先客户端会发起一个握手请求，报文示例如下：

``` http
GET /ws HTTP/1.1
Host: example.com:8000
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: p5acUemNkv08HCjl7rfAKQ==
Sec-WebSocket-Version: 13
```

这显然是一个 HTTP 的报文。升级到 websocket 协议用到了两个标头：

- `Upgrade: websocket`
- `Connection: Upgrade`

剩下以 `Sec-WebSocket-` 开头的标头都是 rfc6455 中规定的 WebSocket 标头。

- `Sec-WebSocket-Version`：协议版本。
- `Sec-WebSocket-Key`：一次性的临时随机选择的经过 base64 编码的 16 byte 的值。
- `Sec-WebSocket-Protocol`：子协议。WebSocket 是个低级协议，所以在其之上构建的协议可以被称为子协议。可以传递多个，以逗号分隔（`,`），按喜好程度降序排列。
- `Sec-WebSocket-Extensions`：希望使用的协议扩展。

类似地，服务端接受连接后，会响应类似下面这段的报文：

```http
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=

```

- `Sec-WebSocket-Accept`: 将客户端发来的 `Sec-WebSocket-Key` （原字符串，并非 base64 编码的）与 `258EAFA5-E914-47DA-95CA-C5AB0DC85B11` 拼接后的值，进行 SHA-1 编码后的结果，再进行 base64 编码后的值。
- `Sec-WebSocket-Extensions`：将使用的扩展
- `Sec-WebSocket-Protocol`：将使用的子协议

### GraphQL Subscription WebSocket 代理

细心的同学会发现，GraphQL 的 WebSocket 传输方式是使用了 `graphql-ws` 子协议，所以网关与原客户端创建的 WebSocket 连接需要使用 `graphql-ws` 协议。但是我们并不需要实现这个子协议，因为下层协议并不关心上层协议的数据，所以我们只需要将数据透传给 upstream 即可。

所以创建连接大概可以这样写：

``` typescript
const headers = omit(
  [
    "connection",
    "upgrade",
    "sec-websocket-key",
    "sec-websocket-version",
    "sec-websocket-extensions",
    "sec-websocket-protocol",
  ],
  request.headers
);
const target = new WebSocket(
  url,
  request.headers["sec-websocket-protocol"],
  {
    headers,
  }
);
```

### 网关必须是一个合格的反向代理服务

其实上面的示例代码中，遗漏了一个很重要的一点，就是添加反向代理相关的请求头。由于网关后端的服务并不能直接获取到前端的一些底层连接信息，所以诸如 `X-Forward-IP`、`X-Real-IP` 等标头需要附加在发往后端的请求头中。

迫于缺乏资料，我也不清楚除了请求头外，还有什么需要处理的。只能从平日使用 Nginx 的经验来反推答案了。





## 参考

- [The WebSocket Protocol -- RFC 6455] https://datatracker.ietf.org/doc/html/rfc6455

