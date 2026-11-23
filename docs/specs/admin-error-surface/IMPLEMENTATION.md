# 管理端错误面与 Frontmatter 诊断详情 实现状态

> 当前有效规范仍以 `./SPEC.md` 为准；这里记录实现覆盖、交付进度与 rollout 相关事实，避免这些细节散落到 PR / Git 历史里。

## Current Status

- Implementation: implemented
- Lifecycle: active
- Catalog note: 诊断卡片与 token 检查已落地，等评审。

## Implementation Coverage

- `REQ-AERR-001`、`REQ-AERR-002`、`REQ-AERR-007`：`apps/admin/src/editor/frontmatter-block.tsx` 新增 `DiagnosticList`，位于闭合 `---` 之后，显示字段名、摘要与可折叠原始文本，超过 3 条折叠，并提供面板级“复制全部”。
- `REQ-AERR-003`：悬停摘要降级为“字段 + 摘要 + 完整诊断在块下方”；滚动与缩放改为跟随锚点重新定位，仅当锚点离开视口或已消失时关闭；徽章点击滚动到对应诊断。
- `REQ-AERR-004`：`buildDiagnosticTooltipStyle` 固定宽度 `min(384px, viewport - 32px)`，锚点靠右时左对齐而不是压缩宽度。
- `REQ-AERR-005`：错误与警告均使用 `--destructive` / `--warning` 四层信号；`apps/admin/src/pages/helpers.tsx` 与 `apps/admin/src/pages/preview.tsx` 的硬编码色改为 token。
- `REQ-AERR-006`：`apps/admin/src/pages/content-sync.tsx` 的 `text-danger` 改为 `text-destructive`；新增 `scripts/check-admin-semantic-tokens.ts`，接入 `bun run check` 的 `check:admin-tokens`。
- `REQ-AERR-008`：折叠原文改用本地 `Disclosure` 原语，未自建等价控件。
- Verification commands: `bun run check`、`bun test tests/lib/admin-semantic-tokens.test.ts`、`bun test tests/lib/admin-ui-controls.test.ts`、单文件运行 `apps/admin/src/editor/universal-editor.test.tsx`。
- Rollout facts: `tests/e2e/admin/post-editor-markdown-modes.spec.ts` 与 `apps/admin/src/components/frontmatter-block.stories.tsx` 的断言已从“悬停看到全文”改为“悬停看摘要、常驻列表看全文”。

## Coverage / rollout summary

- 视觉证据见 `./assets/frontmatter-diagnostics-dark.png`、`./assets/frontmatter-diagnostics-light.png` 与 `./assets/frontmatter-diagnostics-expanded.png`，由 Storybook canvas 以 Playwright 捕获。

## Remaining Gaps

- 无未实现需求；`bun test src/server/clipping` 的 `SIGKILL during translation` 用例在基线上即因 `SQLITE_IOERR_VNODE` 失败，与本改动无关。

## Related Changes

- None

## References

- `./SPEC.md`
- `./HISTORY.md`
