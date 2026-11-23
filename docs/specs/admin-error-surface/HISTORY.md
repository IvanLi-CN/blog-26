# 管理端错误面与 Frontmatter 诊断详情 主题历史

> 这里记录主题局部生命周期、替换、兼容性与必要背景；完整 ADR 取舍保留在 `docs/adr/`。单次任务流水账不放这里，规范正文仍以 `./SPEC.md` 为准。

## Lifecycle / Compatibility

- 新增主题，承接原先由 [Admin Soft UI redesign](../admin-soft-ui-redesign/SPEC.md) “紧凑悬停摘要”条款覆盖的诊断详情呈现；该处继续负责整体视觉系统，本主题只负责错误呈现契约。

## Replacements / Background

- 起点是 Frontmatter 诊断详情浮层的宽度与配色不合理：只设上限不设宽度、错误色仅剩边框与图标、滚动即关闭且不可选中。
- 同时确认管理端存在未定义语义色 token（`text-danger`）与绕过 `--warning` 的硬编码 `amber-*`，因此把语义色一致性纳入同一契约。

## Related Changes

- None

## References

- `./SPEC.md`
- `./IMPLEMENTATION.md`
