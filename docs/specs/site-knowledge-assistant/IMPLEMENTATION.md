# 站内知识助手与 AI 用量实现状态

规范以 [SPEC.md](./SPEC.md) 为准。本文记录当前代码、验证覆盖和发布边界；真实模型、真实 OAuth、生产迁移与部署验收不由本地 Web Demo 或确定性 fixture 代替。

## Current Status

- Implementation: implemented。统一前台身份、助手持久化、检索与引用、生成生命周期、个人配额、全站用量、后台运营界面、剪藏迁移和公开助手页面均已落入当前候选。
- Lifecycle: active。
- Delivery: T8 只收敛最终验收、兼容性/运行手册和 evidence record；不执行生产迁移、部署、真实模型调用或真实 GitHub OAuth。
- Runtime boundary: 静态站只发布公开界面与内容；私人身份、对话、生成状态、引用材料和用量由受信任运行时读取。Console 负责单一助手 worker 与迁移门禁，Gateway 不重复启动 worker。

## Implementation Coverage

| Requirement | 实现覆盖 | 主要验证 |
| --- | --- | --- |
| REQ-SKA-001–003 | `src/server/assistant/api.ts`、`src/server/assistant/service.ts`、`src/server/assistant/runtime.ts` 以 frontend principal 做对话归属，检索通过 `src/server/context.ts` 与公开内容授权边界，结果保存 citations；`src/lib/frontend-auth.ts` 合并原生管理员与 GitHub 读者身份，管理员不要求 GitHub binding，所有私人读写在服务端做 owner check。 | `src/server/public-api/assistant-chat.test.ts`、`src/server/assistant/runtime.test.ts`、`src/lib/frontend-auth.test.ts`、`tests/lib/web-demo-boundary.test.ts`、双 origin frontend-auth route test。 |
| REQ-SKA-004–007 | `site/components/KnowledgeAssistant.tsx` 与 `site/lib/assistant-client.ts` 提供静态/动态共用 FAB、桌面 dock、小屏抽屉、完整 `/chat` 页面、列表切换、剪藏上下文、来源引用和登录回跳；`src/server/clipping/api.ts`/`service.ts` 复用统一 assistant service，目标版本变化时重新校验绑定。 | `tests/components/KnowledgeAssistant.test.tsx`、`tests/components/ClippingDetail.test.tsx`、`tests/lib/web-demo-fetch.test.ts`、`tests/e2e/web-demo/assistant.spec.ts`、`tests/e2e/web-demo/console-memo-boundary.spec.ts`。 |
| REQ-SKA-008–009 | `src/lib/assistant-storage.ts` 维护七天临时对话、管理员豁免、删除/到期清理和 owner-scoped idempotency；`src/server/assistant/runtime.ts` 以 durable generation job、lease、snapshot、SSE reconnect 和 stop 处理视图卸载、重启和断线。 | `src/lib/assistant-storage.test.ts`、`src/server/assistant/runtime.test.ts`、`tests/components/KnowledgeAssistant.test.tsx`、迁移 fixture tests。 |
| REQ-SKA-010–014 | `src/lib/ai-usage.ts` 提供小时/七日 Token 与问答窗口、保守 reservation、实际 usage correction、估算标记、管理员不限额、单用户恢复和助手/非助手计量分离；前台 quota response 由 `src/server/assistant/api.ts` 暴露。 | `src/lib/ai-usage.test.ts`、`src/server/public-api/assistant-chat.test.ts`、`tests/e2e/web-demo/assistant.spec.ts`、`tests/e2e/web-demo/ai-usage.spec.ts`。 |
| REQ-SKA-015–020 | provider attempt 统一写入 `ai_usage_records`，保留原始维度、状态、缺失/估算语义；`runAiUsageMaintenance` 负责九十日明细清理和按日汇总，`apps/admin/src/pages/ai-usage.tsx`、`dashboard.tsx`、`users.tsx` 提供仪表盘、筛选、用户维度和恢复操作。 | `src/lib/ai-usage.test.ts`、`src/server/services/admin-ai-usage.test.ts`、`tests/e2e/web-demo/ai-usage.spec.ts`、`bun run db:migrations:validate`。 |
| REQ-SKA-021 | `src/lib/assistant-discussion-migration.ts` 从当前与旧 Pi durable sources 做确定性 hash、幂等、可恢复迁移；unknown attribution、缺失 source、冲突和不可信 manifest 原样 quarantine；`src/server/assistant/migration-gate.ts` 在公开 clipping chat 暴露前阻断未完成迁移。 | `tests/lib/assistant-discussion-migration.test.ts`、`tests/lib/site-assistant-migration.test.ts`、`src/server/assistant/migration-gate.test.ts`、`docs/runbooks/site-assistant-discussion-migration.md`。 |
| REQ-SKA-022 | `site/components/KnowledgeAssistant.css` 遵循 Nature 响应式与 44px 控件约束；后台交互使用 `apps/admin/src/components/ui.tsx`；Web Demo 通过正式路由、隔离 fixture 和共享 Inspector 提供 guest/user/admin、quota、expiry、failure、reconnect 等场景，live build 与 Demo build 分离。 | `tests/e2e/web-demo/assistant.spec.ts`、`tests/lib/web-demo-boundary.test.ts`、`tests/lib/web-demo-fetch.test.ts`、`bun run web-demo:build`、受控桌面/移动 Web Demo evidence。 |

## Contract and Privacy Checks

- `drizzle/0021`–`0026` 是 forward-only DDL；`0023` 的讨论数据转换由独立、可暂停、可恢复的 `assistant:discussions:migrate` 执行，DDL 完成不等于 backfill 完成。
- `frontend_session_id` 只保存 hash，session、对话、消息、generation 和引用接口均按当前 principal 做归属校验；cookie、身份和私人响应使用 `no-store`，公开 snapshot、Web Demo fixture 和静态构建不携带私人正文或生成状态。
- Web Demo request boundary 只允许 fixture server 处理白名单路由，unknown endpoint 不回落真实 API；live 构建不读取 Demo query/localStorage 开关来切换数据源。
- 迁移 cleanup 只在 `--apply --cleanup` 下执行，并在删除前复核 source hash、target rows、runtime lease、active clipping version 和 Pi task；quarantine payload 与 backup manifest 保留。

## Verification Coverage

VER-SKA-001–008 均有对应确定性测试和正式路由 Web Demo 场景；最终候选的具体命令、计数、SHA 和 review/CI 结论登记在 `docs/version-impact/site-assistant-t8.json`。

- Required checks: `bun run check`、`bun run test:admin-ui`、`bun run db:migrations:validate`、`bun run test`、`bun run build`、`bun run web-demo:build`。
- Assistant/API: frontend-auth、assistant storage/runtime/API、clipping adapter、quota/usage、migration-gate 和 public privacy tests。
- E2E: Web Demo assistant desktop/mobile scenarios, admin usage/quota controls, clipping entry compatibility, and the dual-origin frontend identity contract. All automated scenarios use deterministic fixtures and make no configured-model call.
- Visual evidence: source is the official Web Demo route, not a page-level Storybook story; compare the current assistant full-page/dock at desktop and `393×852` mobile CSS viewports, including no horizontal overflow and 44px controls. The current-candidate evidence is reused only when the inner UI and render inputs are unchanged.

### T8 Observed Gate Results

- `bun run check`: pass (1022 files; 29 warnings and 13 infos already present in the candidate, no errors) after removing only the VM sync metadata file from the source tree.
- `bun run test:admin-ui`: pass (3 tests, 6 expectations).
- `bun run db:migrations:validate`: pass; the Drizzle journal remains strictly increasing and unchanged.
- `bun run test`: 1567 passed and 6 failed in the full VM run. The remaining failures are unrelated baseline/environment cases: two HTTP compatibility rollback tests, release provenance without a transferred `.git` directory, two persistent-Tantivy fault-injection tests, and one interrupted-RAG timeout. The T8 focused contract/privacy/assistant batch passes 90/90 tests (480 expectations).
- `bun run build`: pass with the CI-equivalent fixture database/local content and explicit release metadata; no production credentials or provider call were used.
- `bun run web-demo:build`: pass; public site, Console, and admin Demo artifacts were produced.
- Assistant E2E: pass on desktop and mobile (2/2 each); dual-origin frontend identity, static privacy/boundary checks, and migration/compatibility tests pass. Controlled screenshots are recorded for 1440×1000 desktop and 393×852 mobile viewports.

## Remaining Release Gates

- Real GitHub OAuth on the public site and Console origins, production credentials, production data migration/backfill, post-deploy cache/cookie behavior, and real provider answer quality remain release gates.
- No production migration, deployment, or real model/OAuth acceptance was performed by T8. A green deterministic suite is not a claim of production model quality.

## References

- [需求契约](./SPEC.md)
- [兼容背景](./HISTORY.md)
- [剪藏讨论迁移运行手册](../../runbooks/site-assistant-discussion-migration.md)
