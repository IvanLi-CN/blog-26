# GitHub 读者登录与公开评论兼容背景

## Lifecycle / Compatibility

本主题统一拥有文章、Memo 和项目的 GitHub 读者评论能力。文章原有评论保留归属与审核状态；不将历史自填邮箱解释为已验证 GitHub 身份，也不允许新账号依邮箱或昵称认领旧评论。博客唯一管理员的登录与授权维持独立；管理员可以通过显式的一对一 GitHub 身份绑定识别后续管理员评论作者，但该绑定不授予 GitHub 会话后台权限。

## Replacements / Background

管理员原生前台身份由[站内知识助手](../site-knowledge-assistant/SPEC.md)及 [ADR 0033](../../adr/0033-unified-frontend-user-identity.md)扩展：管理员无需绑定 GitHub 即可评论，站长头像与管理员免审标记适用于两种可信身份入口。以下 GitHub-only 绑定及评论/AI tabs 描述是既有实现的背景，不再限制当前规范；代码差距见实现覆盖。

原评论流程允许游客填写昵称、邮箱并经人机验证后复用对应用户会话，评论关联与编辑删除依赖邮箱；新主题以 GitHub 可信身份作为读者发言入口，替换游客和邮箱读者评论入口、普通评论自动通过、读者编辑及硬删除行为。绑定后的管理员主评论和回复是明确例外：它们由服务端确认绑定关系后直接公开并显示管理员标记。身份隔离与历史评论边界见 [ADR 0029](../../adr/0029-github-reader-and-legacy-comment-identity.md) 和 [ADR 0031](../../adr/0031-github-admin-comment-identity-binding.md)。

新主题为三类详情增加统一评论区域，在宽屏 Console 剪藏场景组合评论与授权 AI 对话，不扩大私人对话访问范围，不替代 Nature 视觉与移动内容流合同，也不改变静态公开站与 Console 的部署边界。

## Related Changes

评论承载层、头像失败回退、显式评论目标状态、管理员绑定关系与审计、OAuth 绑定回调、管理员评论作者快照、公开标记、审核/恢复规则、后台绑定页和官方路由 Web Demo 已落入当前产品实现；实现覆盖与剩余发布门禁见 [IMPLEMENTATION.md](./IMPLEMENTATION.md)。提交、PR 和审查关联由本次交付流程记录。

## References

- [SPEC.md](./SPEC.md)
- [需求设计](../../github-login-comments-design.md)
