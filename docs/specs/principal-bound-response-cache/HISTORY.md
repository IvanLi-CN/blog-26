# 主体绑定响应的缓存边界 主题历史

> 这里记录主题局部生命周期、替换、兼容性与必要背景；完整 ADR 取舍保留在 `docs/adr/`。单次任务流水账不放这里，规范正文仍以 `./SPEC.md` 为准。

## Lifecycle / Compatibility

- 新增主题，作为 [访客可见错误的过滤与预设](../public-error-visibility/SPEC.md) 的前置契约：没有该缓存边界，按身份分级的错误载荷与内容裁剪都可被共享缓存绕过。

## Replacements / Background

- 起点是审查身份分级时发现主体绑定响应缺少缓存声明，进一步查证确认生产网关没有统一响应头后处理，而 console 构建的 Astro middleware 已有默认私有策略。
- 选择“默认私有、显式头优先”，而不是逐接口声明：这样新增主体绑定接口忘记声明时会退化为安全的一侧，且无需维护公开接口白名单。
- 明确不属于本主题的事项：给身份无关的公开读接口选择具体缓存时长。

## Related Changes

- None

## References

- `./SPEC.md`
- `./IMPLEMENTATION.md`
