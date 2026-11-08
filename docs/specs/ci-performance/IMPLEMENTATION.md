# 实现边界

原生搜索使用精确输入缓存并保留每次运行的 conformance 验证，平台身份包含发行版及版本、架构、glibc、C 编译器、链接器和 libgcc/libstdc++ 字节摘要，不再因 hosted runner 的 ImageVersion 单独变化失效；固定 Rust/Bun 工具链、平台采集脚本和构建动作本身也参与输入摘要，防止编译配方变更后复用旧字节。Build 和 Docker 不消费 Unit/Lint 的产物，各自执行并共同参与 required checks。

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

原生搜索使用 `native-search-v2` 精确缓存键，不使用跨平台或跨配方回退键。平台信息采集失败直接阻断构建，不能降级为宽泛缓存键；冷缓存编译与缓存命中后都继续执行完整搜索 conformance。GitHub 原生分支缓存可见性不变，PR 首次运行与合并后首次运行仍可能冷启动。该优化只避免无关 runner 镜像发布使兼容输入失效，不把一次冷暖差异当作全流程收益。

## Web Demo 测试工作复用

Web Demo CI 在同一 job 中保持 public/console 两个正式预览，以桌面、移动两次 Playwright 调用覆盖原有五个测试入口。三个 project 分别绑定 Markdown、公有站和 Console，统一受两个 worker 上限约束；Markdown 保持文件内顺序，其他套件保留 fully-parallel，Console 重试仍为 2，其他套件仍为 0。预览启动或任一测试失败继续阻断所属检查，两份预览均在 always 收尾中关闭。

`@own-viewport` 只标注在首次导航前自行设置全部所需 viewport 的用例，在桌面轮次完整执行，移动轮次不再重复。覆盖映射为：system-share 的 compact publish、wrap、edge-to-edge、native touch 四项；assistant 的 desktop header、mobile navigation、modal sheet、guest mobile 四项；public-cover-media 的 detail/related watermark；search-modes 的 mobile keyboard。它们原有全部尺寸、交互和断言不变。其余默认 viewport 用例继续分别覆盖桌面与移动；project-runtime-motion 原有自带尺寸矩阵仍只执行一次。

验证使用实际 Playwright collection：桌面保留 155 项，移动由 105 项变为 95 项，差集只能是上述 10 项在桌面已覆盖的重复执行。`tests/ci/web-demo-ci-coverage.test.ts` 校验唯一场景集合、允许去重的清单、每项单次收集、worker 上限和每套件重试/路由合同。性能验收绑定同口径完整 workload 的暖缓存前后运行，必须同时降低墙钟与 runner total；单个 job 或冷暖差异不作为整体通过证据。

## 原生 bundle 扫描复用与分段计时

准备阶段保留首次完整扫描的摘要、字节数和稳定路径顺序，沿用原有规则补充读取权限、为任何可执行文件补齐三个执行位后，只更新内存中的 mode 字段，直接用于 manifest；不再为生成 manifest 重读同一份文件。发布前 `verifyBundle` 仍独立重扫并校验全部路径、摘要、权限、链接、必需资源、身份与 ABI，消费端的独立验证也保留。该实现延续 ADR 0042 的产物及安全边界，不改变 runtime 配方、manifest 格式或冻结发布身份。

`native-image-phase` 日志区分 `copy-application`、`prepare-inventory`、`verify-inventory`、`verify-runtime` 与包含后两项的 `verify-before-publish`，记录耗时及成功状态；父子阶段不能重复相加。既有 `native-image-stage` 继续记录编译及生产依赖安装。异常原样传播并保留临时目录清理，不输出环境变量或凭据。

回归验证覆盖补充读取权限、保留可执行位和内部链接、清单字节兼容，以及首次扫描后内容、权限、文件集合或链接变化仍被最终复核拒绝。该优化只减少一次全量摘要扫描，不能消除 BuildKit 远端层下载、解压、镜像 load 或 runner 调度波动；整体性能结论继续要求相同工作负载、缓存状态和排除启动等待的口径。

## Bun 子进程等待与复现

Bun 1.4.2 在 stderr 为管道且等待同步子进程期间发生 GC 时，存在回收 pipe writer 后丢失子进程输出/退出通知的可复现路径；普通文件重定向不会覆盖这一条件。复现与 [Bun 上游 #47257](https://github.com/oven-sh/bun/issues/47257) 描述的私有 event loop 问题一致，不据此断言历史故障只有这一种原因。

`memo-paths` 的 16 个环境隔离子进程用例改用测试专属 `runBun` helper，继承当前固定 Bun 可执行文件，并同时异步收集退出码和两条输出管道。原有全部用例、脚本、断言和超时保持不变，不升级工具链。新增 `bun-subprocess-gc` 回归在独立子进程内建立管道与 GC 条件，再通过同一 helper 调用真实 memo 模块，检查退出码和完整输出；故障注入不污染父测试进程。回归拒绝子进程失败和输出丢失，外层进程有独立终止边界。

## Bootstrap 快照复制与 Web Demo 样式等待

Bootstrap smoke 使用单个 Python 进程复制 Git 选择的文件，避免为每个文件重复启动 dirname、mkdir 和 cp。选择范围仍是 tracked 与未忽略的 untracked 文件；保留文件字节、可执行权限、umask、已有目标权限和 plain cp 的文件链接解引用行为。源文件缺失、Git 读取或复制失败继续使 smoke 失败，源与目标重叠在写入前被拒绝。`worktree-snapshot-copy` 日志只记录文件数、字节数与耗时；全部 bootstrap 场景保持执行。

Console memo 的响应式样式断言在同一次已连接元素的采样中轮询背景、边框样式和边框宽度，避免首次轮询成功后元素被替换而在第二次取样读取到空样式。桌面和移动的三个预期属性保持不变，不修改产品样式、用例集合、重试、超时或 worker。局部复制基准和竞态修复不能替代完整 CI 的性能验收：runner sum 与排除启动等待的关键执行路径必须同时下降。
