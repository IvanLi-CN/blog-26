# 项目标签原生发现主题历史

## Lifecycle / Compatibility

- 当前项目目录在读取旧公共快照时重新组合；已有 dated 内容及生成时间保持兼容。

## Replacements / Background

- ADR 0013 锁定英文分类、原生标签管理边界及项目/dated 分区。
- 主人进一步明确桌面项目使用卡片并提供 Logo/Icon；方形展示区域中的非方形资源完整保留原比例。移动端继续遵守共享连续阅读行合同。
- 主人接受移动端标签采用 13px 字号、26–28px 可见胶囊及更紧凑留白，同时保留 44px 点击区域。
- 主人确认最终四张移动端密度截图；静态、SSR 及 `/blog` 受控页面完成共 690 项导航与几何检查。

## Related Changes

- [PR #168](https://github.com/IvanLi-CN/blog-26/pull/168) integrates projects with native tag discovery, preserves approved card identity and mobile density, and aligns existing public validation with encoded tag routes and canonical classifications.

## References

- [Spec](./SPEC.md)
- [Implementation](./IMPLEMENTATION.md)
