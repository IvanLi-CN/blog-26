# GitHub 读者登录与公开评论实现覆盖

## Current Status

- Implementation: baseline and the approved REQ-GRC-019 to REQ-GRC-021 refinement are implemented. Deterministic focused validation and confirmed Web Demo visual evidence are complete. Real GitHub authorization, production migration and dual-origin acceptance remain release-gate work that remains owner-side after merge。
- Lifecycle: active。
- 基线需求及[默认细节](../../github-login-comments-design.md#已确认的默认细节)已落入产品代码、数据库迁移、公开 API、后台入口、官方路由 Web Demo 与响应式布局；本次确认的评论承载层、头像失败回退和评论目标状态增量已落入共享评论组件、状态模型、Web Demo 与测试。外部 GitHub OAuth App 注册、生产密钥、真实跨 origin 授权和生产数据迁移仍不在本地实现范围内。

## Gate Boundary

- PR merge gate: deterministic OAuth fixtures, isolated migration/backfill recovery, API and UI behavior, official-route Web Demo evidence, review lanes and required CI.
- Release gate: owner-configured GitHub OAuth credentials, real dual-origin browser authorization, production migration/backfill and post-merge target verification. These checks remain mandatory before production release and are not simulated by Web Demo evidence.

## Implementation Coverage

| 需求 | 实现覆盖 | 剩余验证 |
| --- | --- | --- |
| REQ-GRC-001 至 REQ-GRC-004 | `comments` 增加 `targetType/targetKey/readerId/rootId`，文章、Memo、项目详情共用评论区；历史邮箱署名保留且不认领；catalog-only 项目目标可读。 | 真实发布数据迁移后的抽样核对。 |
| REQ-GRC-005 至 REQ-GRC-006 | 独立 `readers`、`reader_sessions`、`reader_oauth_attempts`；服务端 OAuth code + PKCE、一次性 state、七天 hash 会话、可信 origin 回跳、运行时 `SITE_URL` 公开站回跳兼容 Console 构建值、sessionStorage 草稿和 no-store 身份响应。 | 唯一生产 OAuth App 在公开站与 Console 两个生产 origin 上的真实 GitHub 浏览器授权。 |
| REQ-GRC-007 至 REQ-GRC-008 | 新建统一为 pending；本人/管理员可见；REST、tRPC、详情评论区、后台两套入口共享审核与软删除；后台支持类型/状态/删除筛选和批量逐项结果。 | 远端 CI 与真实管理员运行面回归。 |
| REQ-GRC-009 至 REQ-GRC-011 | 读者编辑服务端拒绝；本人软删除；管理员查看原文、单条/批量删除和恢复，恢复固定 pending；revision 条件更新防止迟到操作复活。 | 并发 SQLite 压测和真实后台浏览器操作。 |
| REQ-GRC-012、REQ-GRC-016 | 只允许两层新回复；目标、状态、对象和频率限制服务端校验；submissionKey 幂等；主评论分页、回复游标分页和可继续加载。 | 长讨论浏览器证据。 |
| REQ-GRC-013 至 REQ-GRC-015 | 文章/Memo/项目入口统一；1280px 右栏、640–1279px 下方卡片、<640px 去结构卡片；剪藏 Console 评论/AI tabs 保持私有 AI 条件；公开个性化响应 no-store。 | 官方路由桌面/移动截图、边界断点和键盘交互已验证；远端 CI 与真实管理员运行面仍待完成。 |
| REQ-GRC-017 至 REQ-GRC-018 | 待审核数量排除软删除；Web Demo 使用共享 Inspector 的身份、审核、删除、恢复、延迟/失败和重置状态；静态构建不携带真实身份。 | Web Demo 证据已登记；发布候选检查、远端 CI 与真实 OAuth 可用性仍待完成。 |
| REQ-GRC-019 至 REQ-GRC-021 | 公开评论统一使用“评论”标题并去除 `Conversation`；`CommentSection`、`CommentList`、`CommentForm` 与 `CommentItem` 使用连续内容区和断点承载契约；`CommentAvatar` 处理空 URL、失效 URL 和 fallback 后的稳定占位；`useComments` 暴露 `loading`、`ready-empty`、`ready`、`target-unavailable`、`error`，并保留请求 `status/code`；显式目标 404 不折叠为空列表；Web Demo 与测试覆盖有效空评论、目标不可用、网络失败、头像失败和文章/Memo/项目/Console 正式入口。 | 真实生产目标、双 origin OAuth 和生产数据迁移仍属于发布门禁。 |

## Contract Integration

- `memo-clipping/SPEC.md` 的 REQ-MCL-009 已明确链接本主题：拥有评论区的详情按本主题组合右侧评论与授权 AI tabs；独立 AI 卡和无评论访客单栏保留适用条件，原对话权限、材料与生成恢复合同保持。
- `nature-front-ui/SPEC.md` 继续定义基础视觉与移动内容流；本主题新增评论区域及项目侧栏的组合规则，不能沿用项目小屏侧栏前置规则把评论放到正文前。
- `PublicMemoAuthoring` 内部挂载的 `ClippingDetail` 是 Console 的真实剪藏阅读入口，验收不能仅覆盖静态 `pages/memo.tsx`。
- 现有 REST、tRPC、管理员两套操作入口、计数、导出及旧编辑接口均需要纳入行为检查，不能只覆盖一个按钮或一个新接口。

## Verification

- 本次定向验证通过：评论组件/身份状态单测共 14 tests passed、54 expectations；评论服务端路由、运行时与 Web Demo fixture 套件共 38 tests passed、115 expectations；HTTP compatibility 套件 104 tests passed、3 个既有 skip、638 expectations；两份官方路由评论 E2E 分别为 public 8/8、Console 桌面 10/10，Console 移动 9 项通过并保留 1 项仅适用于宽屏 tabs 的跳过；`bun run web-demo:build`、改动文件 Biome 检查和 `git diff --check` 通过。
- `bun run check` 保留仓库既有 Biome 配置弃用提示及全仓库 lint warnings；`tsc --noEmit` 仍报告既有 admin alias、旧测试夹具和服务类型错误，未发现与本次评论状态改动相关的新错误。`bun run db:migrations:validate` 与基线迁移证据仍按上游实现保留。
- 最终定向套件通过：`src/lib/reader-auth.test.ts`、`src/server/routers/comments.test.ts`、`tests/lib/web-demo-fetch.test.ts`、`tests/components/WebDemoIdentity.test.tsx`、`tests/components/PublicMemoAuthoring.test.tsx`、`src/server/http-compat-api.test.ts`，共 149 tests passed、3 个既有 skip、792 expectations；新增迁移状态门测试覆盖 backfill 未完成时 tRPC 统一返回 `SERVICE_UNAVAILABLE`，并覆盖历史作者邮箱和头像不会进入公开作者投影。
- 迁移证据在隔离 SQLite 中完成：从旧 `comments` 表升级保全正文、署名、状态、ID 和回复关系；新增 `comment_migration_state` 在结构迁移后为 `pending`，只有完整 backfill 才标记 `complete`。缺失父级、循环记录及跨目标父子关系均被 backfill 报告并以 blocked 退出，评论 tRPC、REST 和后台入口在 `pending/running/blocked` 状态统一拒绝服务；重复运行 repaired=0，未重复转换，跨目标子评论的 `root_id` 保持为空。结构迁移与历史回填保持两个有序操作：先运行 `bun run migrate`，再运行 `DB_PATH=... bun run comments:backfill`；backfill 输出 `status=blocked` 或非零退出时不得开放评论 API，修复后重跑直至 `status=complete`，并保留报告作为迁移证据。
- `bun run web-demo:build` 在准备隔离 `dev-data` 数据库与本地内容源后通过，生成 public、admin、Console Web Demo；正式 `bun run build` 已完成前台、后台和 Console 构建，但 `backend:dist` 被仓库要求的 linux/amd64 embedded search module 阻断，macOS 工作区按脚本提示无法本地生成该模块。官方路由浏览器证据确认公开 Memo/项目评论入口和 Console 评论/文章对话 tabs；第一次未配置 `DB_PATH` 的构建按预期因缺少 `posts` 表停止。
- 官方路由 Web Demo 浏览器证据通过：覆盖有效空评论、目标不可用、网络失败、空头像 URL 和失效头像 URL，以及文章官方路由的 320、639、640、1280、1440px 断点；公共评论 E2E 8/8、Console 评论桌面 E2E 10/10，另以移动视口通过 9 项并保留 1 项仅适用于宽屏 tabs 的跳过，覆盖文章、Memo、项目和 Console 剪藏入口、访客/管理员审核边界、单一评论挂载、评论与 AI tabs 键盘切换、正文下移动评论承载层、当前读者与评论作者头像回退、重试控制恢复、四边无结构边框和无横向溢出。639px 证据是带周边留白的评论承载层截图，完整路由边界由 639px E2E 几何断言覆盖；当前证据登记在 `SPEC.md` 的 Visual Evidence 小节。
- 真实 GitHub 登录、外部应用注册、生产 OAuth 密钥、实际双 origin 浏览器授权和生产数据迁移尚未执行；配置缺失时 A3 仍为 unavailable，不能将本地 OAuth fixture 通过视为真实授权验收。
- 全仓库 `tsc --noEmit` 仍会报告基线 admin alias、旧测试夹具和已有服务类型错误；本次改动文件没有新增过滤后的 TypeScript 错误。基线实现的验收范围以 SPEC 的 VER-GRC-001 至 VER-GRC-006 为准；REQ-GRC-019 至 REQ-GRC-021 已通过新增的 VER-GRC-007 定向验证，真实生产目标和 OAuth 仍不在本轮完成范围内。

## References

- [SPEC.md](./SPEC.md)
- [HISTORY.md](./HISTORY.md)
