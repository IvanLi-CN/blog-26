# GitHub 读者登录与公开评论兼容背景

## Lifecycle / Compatibility

本主题统一拥有文章、Memo 和项目的 GitHub 读者评论能力。文章原有评论保留归属与审核状态；不将历史自填邮箱解释为已验证 GitHub 身份，也不允许新账号依邮箱或昵称认领旧评论。博客唯一管理员的登录与授权维持独立。

## Replacements / Background

原评论流程允许游客填写昵称、邮箱并经人机验证后复用对应用户会话，评论关联与编辑删除依赖邮箱；新主题以 GitHub 可信身份作为读者发言入口，替换游客和邮箱读者评论入口、自动通过、读者编辑及硬删除行为。取舍依据见 [ADR 0029](../../adr/0029-github-reader-and-legacy-comment-identity.md)。

新主题为三类详情增加统一评论区域，在宽屏 Console 剪藏场景组合评论与授权 AI 对话，不扩大私人对话访问范围，不替代 Nature 视觉与移动内容流合同，也不改变静态公开站与 Console 的部署边界。

## Related Changes

尚无产品实现、PR 或提交关联；当前仓库行为与实现缺口见 [IMPLEMENTATION.md](./IMPLEMENTATION.md)。

## References

- [SPEC.md](./SPEC.md)
- [需求设计](../../github-login-comments-design.md)
