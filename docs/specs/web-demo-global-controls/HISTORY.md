# Web Demo 全局 Inspector 控制背景

## Lifecycle / Compatibility

- 本主题只拥有全局环境控制，不替代完整 Web Demo 或各业务页面的合同。
- 既有 `d_network` 分享链接保持兼容，独立连接与延迟参数优先。
- 非全局能力不由本主题设计或实现。

## Background

- Web Demo 骨架已随 [PR #169](https://github.com/IvanLi-CN/blog-26/pull/169) 合并；完整 Inspector 的功能性改进独立于骨架交付。
- 全局控制的归属依据作用范围。数据集、请求操作或资源相关的控件即使能够复用，也不因此成为全局环境状态。
- 常驻与高级是展示层级，不能用来代替全局与业务状态的边界。
- 高级区始终包含可展开的自定义延迟与动效设置；没有启用覆盖时使用“展开设置”或“收起设置”，不使用“暂无高级设置”误导用户。
- Web Demo 公共产物采用 `@astrojs/node` standalone SSR，构建时负责隔离 Demo 代码和确定性 fixture；已有 CSR islands 接入共享请求策略。Astro ClientRouter 当前仍交换服务端 HTML，不能把它等同于完整页面 CSR。
- 主人确认拆分交付：先发布全局 Inspector 改动，再通过独立 PR 实现正式产品与 Demo 共用的首屏 SSR、后续页面 CSR；离线应允许进入目标路由，由目标页面真实的数据读取失败承接错误。共享布局的人工错误条已移除。
- Demo 公共 API 适配器对未接入模拟的 `/api/public/*` endpoint 返回确定性 404，不允许在 Demo 构建中回退真实后端。
- 环境变更按字段作用于请求：主题与动效不取消业务加载；身份、连接与延迟取消过时请求并更新已有身份/权限读取器。直接调用 fetch 的后台附件上传也必须接入同一取消策略。公共搜索的既有客户端读取使用确定性 fixture，业务 CRUD 的扩展不属于本主题。
- 请求返回边界必须再次校验取消，即使附加延迟为零；动效偏好必须先同步到产品 DOM，再通知背景协调器，避免消费者读取上一次偏好。
- 已挂载的反应控件也属于环境请求消费者：连接或延迟变化后必须重新读取，旧读取和写入均取消，迟到结果不能覆盖当前目标。后台 Vite 缓存须按 live、Demo build 与 Demo dev 分开，构建隔离不只依赖入口别名。
- SSR 内容保留同样适用于 Memos hydration；离线环境本身不代表某个请求已经失败，分页错误与重试必须由实际读取产生，不能由挂载或连接切换预先创建。
- Inspector 主工作流使用标题与间距表达分组，不在头部、全局环境、Scene、Data 和 Actions 之间重复使用装饰性分隔线；分享与记录作为次要折叠工作流保留唯一边界。
- 相关边界取舍记录于 [ADR 0014](../../adr/0014-web-demo-global-inspector-controls.md)。

## References

- [Requirements](./SPEC.md)
- [Implementation coverage](./IMPLEMENTATION.md)
