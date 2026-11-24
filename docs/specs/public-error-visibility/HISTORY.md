# 访客可见错误的过滤与预设 主题历史

> 这里记录主题局部生命周期、替换、兼容性与必要背景；完整 ADR 取舍保留在 `docs/adr/`。单次任务流水账不放这里，规范正文仍以 `./SPEC.md` 为准。

## Lifecycle / Compatibility

- 新增主题，与 [管理端错误面与 Frontmatter 诊断详情](../admin-error-surface/SPEC.md) 互为对照：同一失败的管理员面保留原始文本，访客面只保留预设。

## Replacements / Background

- 起点是公开接口把技术标记、Zod issue 转储与配置项名称直接透给访客；同时 `/api/trpc/*` 未固定关闭开发模式错误形状。
- 访客载荷选择保持扁平形状并追加 `errorRef`，因此这是行为不兼容、形状兼容的变更：读取 `error` 的调用方无需改结构，但断言原文的用例必须改断言目标。
- 错误标识命名为 `errorRef`，因为 `requestId` 已被助手对话回合的幂等标识占用。

## Related Changes

- None

## References

- `./SPEC.md`
- `./IMPLEMENTATION.md`
