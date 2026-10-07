# 公共产品 CSR 导航背景

## Lifecycle / Compatibility

- 本主题拥有公共产品的页面 CSR 导航，不拥有 Inspector 视觉和后台 SPA 路由。
- 保留 Web Demo 构建时隔离、正式路径和全局环境参数，以及公共静态发布与 console SSR 的既有部署边界。

## Background

- 已有 Astro ClientRouter 获取并交换服务端 HTML；它提供客户端导航，但没有让文章、项目等页面的正文改由客户端结构化数据读取产生。
- 主人要求 SSR 首屏保留，同时让离线下的后续正式路由成功切换，由目标页面实际的数据请求承接失败与恢复。仅在共享布局制造错误条、阻止路由或获取 SSR 内容后隐藏内容，均不满足需求。
- 主人明确要求只在 API 等中间层替换 Demo 行为，共用正式产品的路由与页面。为避免继续扩大 Inspector PR 的范围，CSR 迁移单独交付。

## Related Changes

- 基础：[Inspector PR #174](https://github.com/IvanLi-CN/blog-26/pull/174)。本主题 PR 以其分支为 base，使审查差异仅包含 CSR 工作；基础合并后再按其实际合并结果同步并改为 main。

## References

- [Requirements](./SPEC.md)
- [Implementation coverage](./IMPLEMENTATION.md)
