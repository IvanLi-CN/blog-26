# CI 后续诊断

## Docker 波动的已验证来源

对照来自完整顺序实验的基线 [CI 42446609904](https://github.com/IvanLi-CN/blog-26/actions/runs/42446609904) 与候选 [CI 42449972364](https://github.com/IvanLi-CN/blog-26/actions/runs/42449972364)，分别绑定 `e5d2a405c509da7f7511e9b0707619faa345d3b8` 与 `e1e5b68c934867dae6e50fdbadab1602a65d860f`。只比较实际执行时长，启动排队单列；不是以不同缓存温度证明新优化。

| Docker job 阶段 | 基线（秒） | 候选（秒） |
| --- | ---: | ---: |
| 整个 job，含 setup/post | 188 | 272 |
| Buildx 初始化 | 8 | 23 |
| 原生 bundle 准备及验证 | 40 | 57 |
| Buildx 打包、load、缓存导出 | 62 | 93 |
| 容器 smoke | 10 | 16 |
| build record 上传等 action post | 2 | 2 |
| Buildx builder 删除收尾 | 21 | 21 |

上述大项并非全部步骤，剩余差额包括 checkout、依赖缓存恢复、原生搜索校验等。Buildx 收尾相同，不能把 84 秒差异归因于 builder 删除或 artifact 上传。

BuildKit 日志进一步区分了打包步骤内的工作：两次传输同样约 885.65 MB 的 bundle 上下文，分别 8.5 / 9.5 秒；已命中的依赖 COPY 层仍要从远端下载并解压，分别 14.2 / 35.3 秒；应用 COPY 两次均 7.6 秒；镜像导出（包含嵌套的 Docker load，不能再相加）23.9 / 29.5 秒，其中 load 20.1 / 23.8 秒；GHA 缓存导出 3.8 / 7.0 秒。较慢日志明确显示依赖层约 193.82 MB 下载耗时 27.7 秒、解压 7.4 秒。`CACHED` 表示免于重算，不表示免于缓存传输和解压。

这些是实际分段耗时与下载记录，尚不足以判定网络故障或 runner 抖动的唯一根因。原生准备阶段尚未充分细分。后续值得测量的是减少生产依赖层与 bundle 文件量的可行性，必须先证明运行依赖闭包、原生 ABI 和镜像 smoke 兼容；不能凭本次波动直接删除依赖、关闭缓存或关闭清理。本轮仅修复覆盖守卫并保存诊断，不改变 Docker 配方。

## 性能证据的边界

当前候选完整 11-job 顺序对照为：排除启动等待的执行关键路径 452 → 358 秒，runner sum 2292 → 2135 秒，含调度等待的原始墙钟 1106 → 497 秒。各 job 无 needs，执行关键路径取最长实际 job 时长；不能把它与含排队的原始墙钟混称。完整 runner sum 已计入变慢的 Docker job。

[合并提交的 CI 42454531716](https://github.com/IvanLi-CN/blog-26/actions/runs/42454531716) 与 [E2E 42454531694](https://github.com/IvanLi-CN/blog-26/actions/runs/42454531694) 绑定 `9d8a008d620f93ad4a9207044e170be9cfdffd87`，证明主干适用检查通过；main 正常跳过 Build，只有 10 项 main_required_checks，不与 PR 的完整 11-job workload 混算中位数。后续使用自然产生的相同事件、完整 workload、同工具链和缓存温度样本，达到至少三组后再报告中位数及范围；目前不能宣称长期稳定收益。失败、重试和额外实验单独保留，不挑选成功快样本。

## Bun 子进程与检查适用性

旧候选同步 collection 超时后，既有 memo-paths 的 16 个同步子进程测试也超时。当前 collection 已采用异步 Bun.spawn，并在固定 Bun 1.4.2 的 Actions 中通过。[Bun 上游问题 #47257](https://github.com/oven-sh/bun/issues/47257) 记录 GC 与同步等待的相关缺陷，但本机未重现本仓库的连续超时，不能将它等同于本次已证实根因。既有同步调用仍是待复现风险；本轮不升级工具链或批量改写无关测试。

PR 分支保护包含 Build，而 main_required_checks 排除 Build，符合现有工作流的 PR/main 适用性：Build 在 main 按条件 skipped，main 的十个适用检查全部 success。仅凭两份清单不同不能认定合并门禁错误；本轮不更改保护策略、不删 required contexts。后续若出现真实 PR pending/blocked，才结合该 PR 的 exact-SHA checks 与 provider 策略排查。
