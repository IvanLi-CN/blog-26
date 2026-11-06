# 实现边界

原生搜索使用精确输入缓存并保留每次运行的 conformance 验证，镜像身份包含 hosted runner 的 ImageOS 和 ImageVersion，构建动作本身也参与输入摘要，防止编译配方变更后复用旧字节。Build 和 Docker 不消费 Unit/Lint 的产物，各自执行并共同参与 required checks。

`ci-project` 为 guest/admin 使用两个隔离进程，仍保持每个进程单 worker；user/mcp 使用一个进程。浏览器 project 先 reset、prebuild、构建一次，再复制数据库与内容目录；共享构建的浏览器 API 地址留空，由页面 origin 解析，避免把默认端口固化进分片产物。guest 按运行时间将重型 mobile-reading-surface 矩阵与其余文件分组，admin 按测试级别分片；显式 serial 分组仍由 Playwright 约束。Web Demo 在同一 runner 启用测试级并行并使用两个 worker，以限制浏览器与预览进程的 CPU 争用，保留全部桌面/移动场景。MCP 仅 reset 并复制数据库与内容，启动生产 gateway，以 `/api/version` 就绪；不安装 Chromium、不构建前端、不启动媒体 sidecar，仍保留原 canonical check 和真实 PAT/MCP HTTP 测试。

验证命令：`bun run check`、`bun test tests/server/run-e2e.test.ts`、Playwright `--list` 复用生产入口 `getProjectTestArgs` 的完整参数进行清单并集/交集对照、完整 CI/CD Pipeline 与 E2E Tests。

7–8 分钟是本轮实验目标，不是已有性能证明；最终结论必须绑定当前候选 SHA，并分别给出冷/热缓存和 runner total 对照。

## 测试意图迁移映射

| 原覆盖 | 非浏览器覆盖 | 保留的浏览器/HTTP 覆盖 |
| --- | --- | --- |
| guest dev-auth 的方法、参数、登录/注册、重复邮箱、注册后登录、Cookie 属性 | `src/server/dev-api/auth.test.ts`：正式路由 + 真实迁移后的 SQLite，额外检查会话落库和生产环境开关 | 两个路由均保留真实 HTTP 到浏览器 Cookie jar 的检查 |
| Web Demo Playbook 七种场景的标签、来源身份与快照字段 | `apps/admin/src/demo/business-contracts.test.tsx`：正式 Demo 适配器输出直接渲染正式 `PlaybookSyncStatusDetails` | 桌面/移动正式页面保留当前场景的加载、来源身份与字段接线，其他 scope、修复、刷新、取消、禁用控件仍由原 E2E 验证 |
| Demo admin content-sync guest 403 | 同一非浏览器套件直接调用正式适配器 | 其他真实权限/路由边界用例保留；public page 隐私检查使用真实 preview HTTP request fixture，无需创建页面 |
| AI 不同时间范围的每日值一致性、单用户 reset 不影响其他用户 | 同一非浏览器套件比较正式适配器的完整 DTO，并验证策略持久化、分组和状态过滤 | 保留范围选择、日期输入、表格行数、策略保存、恢复确认对话框与目标用户 UI 更新 |
| Project status 业务状态转换 | 同一非浏览器套件用可控时钟验证 running/conflict/terminal 与 manual history | 原浏览器手动检查、轮询恢复和历史表验证保留 |
| project-runtime-motion 被外层矩阵重复运行 | 此文件不是迁移到模拟 DOM：它本身用 `test.use` 固定 1780×1071，并在 narrow/mobile 用例内部切换至 393×852 | 只在第一条 public 命令运行一次；保留全部真实浏览器动画、几何、reduced motion、失败恢复、移动明暗主题场景，其他文件仍跑桌面/移动两遍 |

新非浏览器套件由现有 `test:unit` 自动发现并以 `--isolate` 执行，不新增 job、缓存、artifact 或 retention 配置。超时、重试、worker 数与 required checks 集合不变。性能基线是 PR #451 最终候选的完整 11-check workload（墙钟 9:13、runner total 49:38）；新候选须等待 Actions 才能报告结果。

## 图片构建复用

两个项目图片生成器通过 `scripts/project-media-cache.ts` 复用经过版本、摘要、路径、尺寸、格式与预算校验的单图条目；配方覆盖实际脚本及编码器平台身份，源图字节和文件身份决定单图键。manifest 从当前集合重建，过期缓存与生成产物按受管理路径清理。原子条目发布避免半成品命中；缓存故障回退生成，实际生成失败保持 fail-closed。

Build、浏览器 E2E 和 Web Demo 通过共享 composite action 恢复聚合缓存；MCP 无图片生成，不恢复该缓存。Docker 将同一生成器与输入放进 `project-media` 阶段，应用源码和构建身份保留在 builder；宿主缓存不进入上下文。

验证由 `tests/lib/project-media-cache.test.ts`、既有图片套件、全量 required checks，以及现有 CI/CD Pipeline 的显式性能实验输入承担。冷暖性能与 Docker 失效证据保存在绑定候选 SHA 的 Actions 日志和 PR 中，不把运行结果回写成源代码变更。实验不增加常规 job、生产者依赖、artifact 或 retention。
