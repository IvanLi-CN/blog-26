# GitHub 读者登录与公开评论实现覆盖

## Current Status

- Implementation: implemented for the local deterministic contract. The GitHub reader-comment baseline, explicit administrator binding, native administrator frontend identity, shared comment projection, and public assistant integration are implemented. Real GitHub authorization, production migration and dual-origin production acceptance remain release gates。
- Lifecycle: active。
- 基线需求及[默认细节](../../github-login-comments-design.md#已确认的默认细节)已落入产品代码、数据库迁移、公开 API、后台入口、官方路由 Web Demo 与响应式布局；评论承载层、头像失败回退、评论目标状态、管理员 GitHub 身份绑定、管理员作者标记、管理员评论免审、解绑历史保留和不含 token 审计事件也已落入当前实现。外部 GitHub OAuth App 注册、生产密钥、真实跨 origin 授权和生产数据迁移仍不在本地实现范围内。

## Gate Boundary

- Existing visual assets describe the GitHub-only baseline and are retained for compatibility: [Console comments](./assets/console-admin-comments-1440.png), [bound administrator desktop](./assets/github-admin-public-1440.png), [bound administrator mobile](./assets/github-admin-public-393.png), [binding desktop](./assets/github-admin-binding-1440.png), [binding mobile](./assets/github-admin-binding-393.png), and [binding Inspector](./assets/github-admin-inspector-1440.png). They do not verify native administrator frontend identity, footer-avatar rendering or the shared assistant entry.
- PR merge gate: deterministic OAuth fixtures, isolated migration/backfill recovery, API and UI behavior, official-route Web Demo evidence, review lanes and required CI.
- Release gate: owner-configured GitHub OAuth credentials, real dual-origin browser authorization, production migration/backfill and post-merge target verification. These checks remain mandatory before production release and are not simulated by Web Demo evidence.

## Implementation Coverage

| 需求 | 实现覆盖 | 剩余验证 |
| --- | --- | --- |
| REQ-GRC-001 至 REQ-GRC-004 | `comments` 增加 `targetType/targetKey/readerId/rootId`，文章、Memo、项目详情共用评论区；历史邮箱署名保留且不认领；catalog-only 项目目标可读。 | 真实发布数据迁移后的抽样核对。 |
| REQ-GRC-005 至 REQ-GRC-006 | 独立 `readers`、`reader_sessions`、`reader_oauth_attempts`；服务端 OAuth code + PKCE、一次性 state、七天 hash 会话、可信 origin 回跳、运行时 `SITE_URL` 公开站回跳兼容 Console 构建值、sessionStorage 草稿和 no-store 身份响应。统一 frontend-auth route 已覆盖配置的公开站/Console 双 origin 请求边界。 | 唯一生产 OAuth App 在公开站与 Console 两个生产 origin 上的真实 GitHub 浏览器授权。 |
| REQ-GRC-007 至 REQ-GRC-008 | 普通读者新建统一为 pending；绑定 GitHub reader 的管理员主评论/回复由服务端写入 approved；作者角色快照贯穿 REST、tRPC、详情评论区和后台列表；后台绑定页使用本地 primitives，评论支持按角色恢复。 | 远端 CI 与真实管理员运行面回归；生产 OAuth 绑定仍是 release gate。 |
| REQ-GRC-009 至 REQ-GRC-011 | 读者编辑服务端拒绝；本人软删除；管理员查看原文、单条/批量删除和恢复，普通评论恢复 pending，管理员评论按持久化作者角色恢复 approved 并保留标记；revision 条件更新防止迟到操作复活。 | 并发 SQLite 压测和真实后台浏览器操作。 |
| REQ-GRC-012、REQ-GRC-016 | 只允许两层新回复；目标、状态、对象和频率限制服务端校验；submissionKey 幂等；主评论分页、回复游标分页和可继续加载。 | 长讨论浏览器证据。 |
| REQ-GRC-013 至 REQ-GRC-015 | 文章/Memo/项目入口统一；1280px 右栏、640–1279px 下方卡片、<640px 去结构卡片；剪藏 Console 评论/AI tabs 保持私有 AI 条件；公开个性化响应 no-store。 | 官方路由桌面/移动截图、边界断点和键盘交互已验证；远端 CI 与真实管理员运行面仍待完成。 |
| REQ-GRC-017 至 REQ-GRC-018 | 待审核数量排除软删除和管理员评论；Web Demo Inspector 使用共享的身份、审核、删除、恢复、延迟/失败、绑定和重置状态，静态构建不携带真实身份。 | Web Demo 桌面/移动证据、发布候选检查、远端 CI 与真实 OAuth 可用性仍待完成。 |
| REQ-GRC-019 至 REQ-GRC-021 | 公开评论统一使用“评论”标题并去除 `Conversation`；`CommentSection`、`CommentList`、`CommentForm` 与 `CommentItem` 使用连续内容区和断点承载契约；`CommentAvatar` 处理空 URL、失效 URL 和 fallback 后的稳定占位；`useComments` 暴露 `loading`、`ready-empty`、`ready`、`target-unavailable`、`error`，并保留请求 `status/code`；显式目标 404 不折叠为空列表；Web Demo 与测试覆盖有效空评论、目标不可用、网络失败、头像失败和文章/Memo/项目/Console 正式入口。 | 真实生产目标、双 origin OAuth 和生产数据迁移仍属于发布门禁。 |
| REQ-GRC-022 | 新增 `admin_github_bindings`、`admin_github_binding_events`、角色/GitHub ID 快照；绑定入口使用现有 OAuth App、无 scope、PKCE S256、一次性 state 和同管理员会话；冲突/取消/失败/重放/过期保留旧关系并审计；后台提供绑定状态和解绑确认。 | 真实 GitHub 授权、生产 OAuth 配置、生产迁移和 dual-origin 浏览器验收。 |

## Contract Integration

- [站内知识助手](../site-knowledge-assistant/SPEC.md)拥有统一前台身份、无需 GitHub 的管理员评论与共享助手入口；本主题的 REQ-GRC-002、003、005、007、009、014、018、022 及相应验证已由当前 assistant implementation 与 T8 evidence 覆盖。生产 OAuth 和真实双 origin 浏览器授权仍是发布门禁。
- `memo-clipping/SPEC.md` 的 REQ-MCL-009 保留阅读材料及评论布局，私人问答改由全站助手面板和完整界面承载。当前代码中的评论/AI tabs 与独立剪藏讨论需要归并，已有截图不构成新入口的验证。
- `nature-front-ui/SPEC.md` 继续定义基础视觉与移动内容流；本主题新增评论区域及项目侧栏的组合规则，不能沿用项目小屏侧栏前置规则把评论放到正文前。
- `PublicMemoAuthoring` 内部挂载的 `ClippingDetail` 是 Console 的真实剪藏阅读入口，验收不能仅覆盖静态 `pages/memo.tsx`。
- 现有 REST、tRPC、管理员两套操作入口、计数、导出及旧编辑接口均需要纳入行为检查，不能只覆盖一个按钮或一个新接口。

## Verification

- `bun run check` 通过，包含 Biome 和 `check:admin-ui`；仓库既有 Biome warnings 保持原状。`bun run db:migrations:validate`、`git diff --check` 和 Spec 合同检查通过。
- 历史基线曾记录 1396 tests passed；T8 当前 VM 全量运行记录 1567 passed、6 个与本主题无关的基线/环境失败，不能宣称全仓库全绿。定向 OAuth、评论、HTTP compatibility、Web Demo runtime/fetch 测试和官方路由绑定场景的结果及当前 SHA 以 Site Assistant T8 impact record 为准。
- 迁移证据在隔离 SQLite 中完成：新旧数据库均验证 binding/comment migration、唯一约束、角色默认值、OAuth purpose 字段、审计记录和 token 不落库；历史评论不自动认领，解绑不改变已有管理员评论。
- `bun run web-demo:build`、官方路由 Web Demo 浏览器证据和视觉证据通过：覆盖有效空评论、目标不可用、网络失败、空/失效头像、普通读者审核、绑定/未绑定管理员直接公开、公开作者标记、解绑历史保留、软删除恢复、Inspector 状态分享、评论与 Console AI tabs、共享助手入口、响应式断点和无横向溢出；当前候选的 exact command/SHA 事实登记在 Site Assistant T8 impact record。
- 当前定向证据已覆盖评论承载层、头像回退、显式目标状态、迁移约束、OAuth fixture 成功/失败生命周期、REST/tRPC 管理员作者角色、绑定/解绑管理台和历史恢复语义；这些证据仍不能替代真实 GitHub 授权和生产 dual-origin 验收。
- 真实 GitHub 登录、外部应用注册、生产 OAuth 密钥、实际双 origin 浏览器授权和生产数据迁移尚未执行；配置缺失时 A3 仍为 unavailable，不能将本地 OAuth fixture 通过视为真实授权验收。
- 全仓库 `tsc --noEmit` 仍会报告基线 admin alias、旧测试夹具和已有服务类型错误；本次改动文件没有新增过滤后的 TypeScript 错误。生产运行面仍属于 release gate。

## References

- [SPEC.md](./SPEC.md)
- [HISTORY.md](./HISTORY.md)
