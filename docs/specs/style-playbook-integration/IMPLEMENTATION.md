# Style Playbook集成实现状态

## Current Status

- Lifecycle: active
- Implementation: 博客消费端已实现，正在完成交付验证与独立审查；上游公开资产与通知由独立任务实现。
- Catalog note: 原生Playbook、内容 workflow 和 console 持久快照已落地，生产接入及自动更新默认关闭。

## Implementation Coverage

| Requirements | 实现 | 验证 |
| --- | --- | --- |
| `REQ-PBI-001`、`REQ-PBI-002` | Astro 原生目录与详情、受控 Markdown、关系及 anchor、匿名 Policy 资源；严格公开包校验和归档安全检查 | `playbook-contract.test.ts` 的完整公开样例、私有字段拒绝、损坏归档与 SSR；Storybook 控制场景 |
| `REQ-PBI-003`、`REQ-PBI-004` | 固定 Release 元数据复核、tag commit 核对；release/reconcile 入口及每小时第 17 分钟补漏 | 模拟 GitHub reader 检查 draft、prerelease、身份不符与最高就绪稳定 SemVer |
| `REQ-PBI-005`、`REQ-PBI-006` | 内容刷新复用已部署 renderer 和独立文章/Memo 快照；正常前端与内容/回滚 job 共享排队锁，锁内重建 | 部署适配器检查幂等、迟到、变化后重建、失败不采用及显式暂停回滚；workflow 结构测试 |
| `REQ-PBI-007` | edition 包含 renderer、来源包和完整公开文件摘要；同批指针、页面、搜索、资源及原始包，保留前一版 | 静态产物校验、身份重算、旧文件保留、不可变与重新验证缓存策略测试 |
| `REQ-PBI-008`、`REQ-PBI-009` | console 启动加载持久缓存/固定 seed，立即和每 300 秒单任务同步；完整验证后原子采用 | 可控时钟、断网/损坏/schema 不兼容、重启、缓存优先、首次 HTTP SSR 及指定 edition 搜索 |
| `REQ-PBI-010`、`REQ-PBI-011` | MiniSearch 中英文分词、Policy 独立文档、五类过滤、按来源分组；请求/采用身份记录和整体回滚入口 | 确定性检索、API 409、Storybook 搜索场景及构建/部署适配器测试 |

## Validation Evidence

共享测试机执行静态站、console 与 Storybook 构建；实际静态 HTML 和 console 首次 HTTP 响应包含Playbook正文、anchor 及同一 edition，指定搜索 edition 可读取，未知 edition 返回 409。全量仓库测试首次验证为 691 项通过；后续代码修复使用相关测试及受影响构建重新验证。`bun run check` 保留仓库既有告警，不引入新的检查失败。

视觉证据覆盖 390/1280 宽度及明暗主题，使用公开控制样例，无登录或来源仓库访问。截图确认、当前 Candidate 的正式审查和 live PR 状态属于交付门禁；尚未通过的门禁不计为已完成验收。

## Remaining Gaps

- 上游原生 Release 尚需产出可重复公开包并在 manifest 最后上传后调用博客入口，见 [公开包契约](./contracts/public-package.md) 和 [触发契约](./contracts/release-trigger.md)。消费端提供共享类型、校验器和样例；此 PR 不修改上游。
- GitHub App 安装、权限与真实跨仓调用未验证；生产通知和博客自动更新未启用。现有旧 Release 不作为初始包，首次接入使用显式固定、具有资产的新稳定 Release。
- 真实 EdgeOne 原子发布、生产指针及 console 五分钟跟随由两仓合并后的上线阶段验证；模拟适配器与本地 HTTP 结果不替代生产验收。
- 本任务停在 merge-ready，不合并、不触发真实 Release、不配置远端凭据。上线顺序和暂停/回滚流程见 [发布 runbook](../../runbooks/style-playbook-publishing.md)。

## References

- [长期需求](./SPEC.md)
- [公开包契约](./contracts/public-package.md)
- [Release 触发契约](./contracts/release-trigger.md)
- [研究基线与主题历史](./HISTORY.md)
- [ADR 0011](../../adr/0011-published-playbook-read-model.md)
