# 站内知识助手与 AI 用量兼容背景

## Lifecycle / Compatibility

- 本主题仍为 `active`，当前实现状态为 `implemented`；需求、实现覆盖和验收事实分别以 [SPEC.md](./SPEC.md)、[IMPLEMENTATION.md](./IMPLEMENTATION.md) 与 T8 version-impact record 为准。
- 统一助手在同一前台 principal 下承载一般对话和剪藏关联对话。静态公开内容、动态 Console、后台管理员身份和 GitHub reader identity 仍是不同边界；后台登录不会替代前台 session，管理员也不能由此读取其他用户的私人对话。
- T1–T7 的数据库迁移为 forward-only；T3/T7 的历史讨论 backfill 是独立的 resumable operation，旧安装在 migration gate 未完成前不暴露统一 clipping chat。生产数据未由本地验收读取或变更。

## Replacements / Background

- ADR 0032–0037 记录临时对话与用量保留、统一前台身份、检索授权、个人额度与运营计量、生成生命周期、剪藏归并的长期取舍；ADR 0038 记录前台身份与助手存储边界。
- 原剪藏讨论的 creator/admin 共用模型已由 frontend-user-owned conversations 替代。具有可信创建者的记录整体迁移；无逐条作者或无法确认归属的记录保留 raw quarantine，不猜测作者、不自动开放给管理员、不直接删除。
- 对话删除、到期和配额恢复不清除真实 AI usage；运营明细保留原始 provider dimensions，并由按日汇总承接九十日明细清理。估算 usage 与实际 correction 分开表示。
- 新增的浏览器 sessionStorage 草稿、pending request 和 login handoff 是 T6 的 additive ephemeral state；旧版本缺失这些 key 时按空状态读取。T7 消费既有 assistant tables 和 migration ledger，不新增 Drizzle migration。

## T8 Acceptance Boundary

- T8 只收敛当前候选的 checks、assistant/API/E2E、迁移/兼容/隐私证据、Web Demo 视觉证据和文档 hash；所有 evidence 绑定实际 head SHA。
- 确定性测试与 Web Demo 不证明真实模型回答质量、GitHub OAuth 配置、双生产 origin cookie/cache 行为、生产 backfill 或部署结果。上述项目仍是发布门禁，不能以本地 green suite 代替。
- `docs/runbooks/site-assistant-discussion-migration.md` 是迁移的操作入口：先 DDL，再 dry-run/apply/resume，最后按独立条件执行 cleanup；任何旧运行时回滚都不能被解释为自动 down-migration。

## References

- [需求契约](./SPEC.md)
- [实现覆盖](./IMPLEMENTATION.md)
- [剪藏讨论迁移运行手册](../../runbooks/site-assistant-discussion-migration.md)
- [评论兼容背景](../github-reader-comments/HISTORY.md)
- [剪藏兼容背景](../memo-clipping/HISTORY.md)
