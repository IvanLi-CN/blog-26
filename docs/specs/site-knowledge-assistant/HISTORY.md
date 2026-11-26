# 站内知识助手与 AI 用量兼容背景

## Lifecycle / Compatibility

- 本主题仍为 `active`，当前实现状态为 `implemented`；需求与实现覆盖以 [SPEC.md](./SPEC.md)、[IMPLEMENTATION.md](./IMPLEMENTATION.md) 为准，验收结论见 IMPLEMENTATION 的 `## Verification Coverage` 与对应 PR。
- 统一助手在同一前台 principal 下承载一般对话和剪藏关联对话。静态公开内容、动态 Console、后台管理员身份和 GitHub reader identity 仍是不同边界；后台登录不会替代前台 session，管理员也不能由此读取其他用户的私人对话。
- T1–T7 的数据库迁移为 forward-only；T3/T7 的历史讨论 backfill 是独立的 resumable operation，旧安装在 migration gate 未完成前不暴露统一 clipping chat。生产数据未由本地验收读取或变更。

## Replacements / Background

- ADR 0032–0037 记录临时对话与用量保留、统一前台身份、检索授权、个人额度与运营计量、生成生命周期、剪藏归并的长期取舍；ADR 0038 记录前台身份与助手存储边界。
- 原剪藏讨论的 creator/admin 共用模型已由 frontend-user-owned conversations 替代。具有可信创建者的记录整体迁移；无逐条作者或无法确认归属的记录保留 raw quarantine，不猜测作者、不自动开放给管理员、不直接删除。
- 对话删除、到期和配额恢复不清除真实 AI usage；运营明细保留原始 provider dimensions，并由按日汇总承接九十日明细清理。估算 usage 与实际 correction 分开表示。
- 新增的浏览器 sessionStorage 草稿、pending request 和 login handoff 是 T6 的 additive ephemeral state；旧版本缺失这些 key 时按空状态读取。T7 消费既有 assistant tables 和 migration ledger，不新增 Drizzle migration。

## T8 Acceptance Boundary

- T8 只收敛当前候选的 checks、assistant/API/E2E、迁移/兼容/隐私证据和 Web Demo 视觉证据；候选 head SHA 随对应 PR 记录，不单独维护逐文件证据文件。
- 知识助手的内联请求失败提示采用 shadcn/ui Alert 组合；重试操作使用紧凑视觉尺寸，在同排时右端对齐，空间不足换行后仍保持右端对齐，不改变普通控件的 44px 触控约束。
- 确定性测试与 Web Demo 不证明真实模型回答质量、GitHub OAuth 配置、双生产 origin cookie/cache 行为、生产 backfill 或部署结果。上述项目仍是发布门禁，不能以本地 green suite 代替。
- `docs/runbooks/site-assistant-discussion-migration.md` 是迁移的操作入口：先 DDL，再 dry-run/apply/resume，最后按独立条件执行 cleanup；任何旧运行时回滚都不能被解释为自动 down-migration。

## References

- [需求契约](./SPEC.md)
- [实现覆盖](./IMPLEMENTATION.md)
- [剪藏讨论迁移运行手册](../../runbooks/site-assistant-discussion-migration.md)
- [评论兼容背景](../github-reader-comments/HISTORY.md)
- [剪藏兼容背景](../memo-clipping/HISTORY.md)

## Pi 执行边界

ADR 0042 将一般助手与剪藏对话的模型编排统一到 Pi Harness，保留 ADR 0038 的应用消息所有权和现有中断恢复语义。一般助手从仅站内资料回答扩展为站内优先、允许通用回答并按需使用 Tavily Hikari；剪藏对话仍沿用当前文章阅读边界。

## 生成失败反馈

生成任务沿用原有错误码存储，不新增数据迁移。服务端在本人快照、SSE 和停止响应上投影预设说明；管理员额外收到已登记的诊断，普通用户不接收技术码。缺少具体原因的历史记录保持通用提示。失败正文与错误卡分开呈现，原问题重试与原有对话归属不变。
