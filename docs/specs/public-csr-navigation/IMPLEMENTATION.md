# 公共产品 CSR 导航实现状态

## Current Status

- Implementation: 未开始
- Lifecycle: active
- 本主题已记录主人确认的 SSR 首屏、后续 CSR、共享产品组件和中间层替换边界。当前 Draft 仅包含需求与验收合同，尚未提交路由实现；不得称为已修复。

## Implementation Coverage

| 合同 | 当前事实 | 缺口 |
|---|---|---|
| REQ-PCSR-001 | Web Demo 使用 Astro Node SSR，console 同样支持 SSR。 | 公共页面仍由 Astro 组合；后续共享 CSR bootstrap 尚未实现。 |
| REQ-PCSR-002、REQ-PCSR-003 | `site/layouts/BaseLayout.astro` 使用 Astro ClientRouter；目标 HTML 在服务端生成。 | 需要共享客户端路由、页面组件和结构化数据加载；HTML 交换不满足本合同。 |
| REQ-PCSR-004 | `src/lib/web-demo-runtime.ts`、`src/lib/web-demo-fetch.ts` 已提供全局环境与客户端 API 适配。 | 全部公共路由的数据加载尚未接入；不能以 islands 请求失败证明页面路由读取失败。 |
| REQ-PCSR-005 | 浏览器 HTML 交换已有历史导航；已有请求适配支持取消。 | 新的页面 CSR 请求生命周期与历史恢复仍需接入验证。 |
| REQ-PCSR-006 | 正式路由、构建时 Demo 选择、Nature UI 和 Inspector 几何已存在。 | 页面组件迁移与 live/Demo 内容、响应式和制品验证仍未执行。 |

## Verification

- `SPEC.md` 结构检查和文档检查针对本主题合同；不构成功能验证。
- Inspector 基础 PR 的 836 项 VM 单元测试不覆盖尚未实现的页面 CSR。
- VER-PCSR-001 至 VER-PCSR-005 均等待实际实现与对应验证。

## Remaining Gaps

- 提取正式公共页面的共享客户端渲染与路由数据边界，保留原组件表现，不复制 Demo 页面。
- 接入目标路由读取、原位失败/恢复、历史、取消和全局环境策略。
- 同步 ADR 0010 的后续导航实现事实；其首屏授权、部署和缓存边界不能被顺带削弱。
- 完成 Agent VM 集成/E2E、网络请求证据与 live/Demo 制品检查，再申请移出 Draft。

## References

- [Requirements](./SPEC.md)
- [Topic history](./HISTORY.md)
