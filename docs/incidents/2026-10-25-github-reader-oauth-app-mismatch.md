# GitHub Reader OAuth App 配置事故报告

## 事故结论

本次事故的根因是生产读者登录曾误用与本项目无关的 `Ivan's Comment` OAuth App，而实现需要的是 `Ivan's Blog Reader` App；修复后当前项目已经切换到正确 App。`Ivan's Comment` 属于其他项目，不是本项目的第二个 App，不应被删除、重命名或纳入本项目配置。用户在 GitHub 授权页看到错误的 App 名称，并在旧回调路径上得到 404。生产运行面包含公开站与 Console 两个 origin，但 OAuth 回调统一落在 Console。

## 影响范围

- 授权页显示旧 App 名称 `Ivan's Comment`，与 GitHub 读者登录产品不一致。
- 旧 App 的回调包含 `https://comment.ivanli.cc/api/oauth/github/callback`，该地址当前返回 404。
- 生产读者登录曾进入错误回调链路，取消或失败时可能落到旧域名/旧路由。
- 生产环境包含公开站 `https://ivanli.cc` 和 Console `https://console.ivanli.cc` 两个 origin；它们共享同一个读者 OAuth App 和同一个 Console 回调。
- 修正旧 App 后又发现第二个独立缺陷：`console:build` 将通用 `PUBLIC_SITE_URL` 编译成 Console origin，导致运行时即使配置了 `PUBLIC_SITE_URL=https://ivanli.cc`，跨 origin 回跳仍丢失公开站路径。
- 未发现读者数据库、管理员身份或评论数据丢失；当前生产入口已返回新 App 的 Client ID `Ov23li7maPY9CFFsQAri`，并使用 `https://console.ivanli.cc/api/public/reader-auth/github/callback`。

## 事实证据

- GitHub OAuth App 列表中可见 `Ivan's Blog Reader`（应用 ID `3961876`）和另一个属于其他项目的 `Ivan's Comment`（应用 ID `2012665`）。
- `Ivan's Blog Reader` 的 Client ID 为 `Ov23li7maPY9CFFsQAri`，唯一回调为 `https://console.ivanli.cc/api/public/reader-auth/github/callback`。
- `Ivan's Comment` 的 Client ID 为 `db51405ff2f729f6952b`，其 `comment.ivanli.cc` 回调属于其他项目；本项目不得使用或修改它。
- `https://console.ivanli.cc/api/public/reader-auth/github/start` 当前返回的授权地址使用 Client ID `Ov23li7maPY9CFFsQAri` 和 Console 回调。
- 生产容器配置实际包含 `PUBLIC_SITE_URL=https://ivanli.cc`，但当前镜像的 `console-dist/server/chunks/router_*.mjs` 把 `PUBLIC_SITE_URL` 编译为 `https://console.ivanli.cc`；因此运行时环境变量无法修正跨 origin 白名单。
- 线上取消回跳实测：Console 目标返回原 Console 路径；公开站目标返回 `https://console.ivanli.cc/?reader_auth_error=cancelled`，证明公开站路径在当前镜像中被丢失。
- `https://comment.ivanli.cc/` 及其旧 OAuth 回调当前返回 HTTP 404。

## 时间线

1. 读者登录实现上线后，生产授权链路使用了旧的 `Ivan's Comment` App/旧回调语义。
2. 用户在 GitHub 授权页发现 App 名称和回调目标不正确，并报告旧域名 404。
3. 修复过程中切换到 `Ivan's Blog Reader`，生产代码和运行配置随后使用新 Client ID 与 Console 回调。
4. 后续沟通错误地把公开站/Console 两个生产 origin 简化成“一个生产域名”，又把与本项目无关的 App 当成重复配置，进一步偏离实际事故。
5. 线上取消回跳回归暴露了构建期 `PUBLIC_SITE_URL` 覆盖运行时配置的问题。

## 根因

1. 没有在首次部署前建立并核对本项目唯一的生产 OAuth App、Client ID、App 名称和回调清单。
2. 发现错误 App 后没有先确认 GitHub App 的项目归属，导致把其他项目的 App 当成当前项目配置。
3. 部署验证只验证了授权流程是否能继续，没有把 GitHub 授权页 App 名称、Client ID、回调域名和旧 App 清理作为发布门禁。
4. 历史计划中的测试隔离假设被错误带入生产说明，掩盖了“两个生产 App”的真正问题。
5. Console 构建复用了面向 Console SSR 的 `PUBLIC_SITE_URL` 编译值，读者 OAuth 回跳却把它当成运行时公开站配置，造成构建期值覆盖部署期值。

## 已完成处置

- 生产授权入口已切换到 `Ivan's Blog Reader` 的 Client ID `Ov23li7maPY9CFFsQAri`。
- 生产回调已统一为 `https://console.ivanli.cc/api/public/reader-auth/github/callback`。
- 代码和文档中的回调路径已统一到 `/api/public/reader-auth/github/callback`。
- 读者 OAuth 回跳白名单现在优先读取运行时 `SITE_URL`，不再依赖被 Console 构建替换的 `PUBLIC_SITE_URL`；已补跨 origin 回归测试。
- 设计文档和主题 Spec 已明确唯一生产 App/唯一精确回调，不再描述第二个 App 或独立测试环境。

## 必须完成的修复

1. 保留 `Ivan's Blog Reader`（应用 ID `3961876`）作为本项目唯一的生产 OAuth App；不得操作属于其他项目的 `Ivan's Comment`。
2. 发布包含运行时 `SITE_URL` 修复的新镜像后，重新验证公开站和 Console 两个生产 origin 都能发起登录，并统一回到 `https://console.ivanli.cc/api/public/reader-auth/github/callback`。
3. 验证生产授权入口返回 `Ov23li7maPY9CFFsQAri`，GitHub 授权页显示 `Ivan's Blog Reader`，授权成功、取消和失败都回到原始内容路径，且不出现 404。
4. 将本项目唯一回调、唯一 Client ID 前缀和 App 归属写入部署检查清单；禁止 wildcard 和 Device Flow。

## 验收标准

- `Ivan's Blog Reader` 是本项目唯一使用的生产 OAuth App；其他项目的 OAuth App 不被修改或复用。
- 生产 `/api/public/reader-auth/github/start` 只生成 `Ov23li7maPY9CFFsQAri` 和 Console 回调。
- 授权页显示正确 App 名称；成功登录后能返回发起登录的文章、Memo 或项目页面。
- 用户取消授权、state 失效或授权失败时，回到原始页面并显示错误状态，不跳转到 `comment.ivanli.cc`，不返回 404。
- 管理员身份、评论数据和旧历史评论不因 OAuth App 收敛而改变。

## 当前阻塞

没有需要删除其他项目 OAuth App 的动作。当前线上镜像仍是修复前构建，已证明 Console 目标取消回跳正常、公开站目标仍被收敛到 Console 根路径；代码修复和回归测试已完成，必须发布包含 `SITE_URL` 运行时读取修复的新镜像，再完成公开站与 Console 两个生产 origin 的真实授权、取消和失败回跳回归。
