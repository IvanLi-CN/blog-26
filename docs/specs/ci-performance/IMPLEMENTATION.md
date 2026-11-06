# 实现边界

原生搜索使用精确输入缓存并保留每次运行的 conformance 验证，镜像身份包含 hosted runner 的 ImageOS 和 ImageVersion，构建动作本身也参与输入摘要，防止编译配方变更后复用旧字节。Build 和 Docker 不消费 Unit/Lint 的产物，各自执行并共同参与 required checks。

`ci-project` 为 guest/admin 使用两个隔离进程，仍保持每个进程单 worker；user/mcp 使用一个进程。先 reset、prebuild、构建一次，再复制数据库与内容目录；共享构建的浏览器 API 地址留空，由页面 origin 解析，避免把默认端口固化进分片产物。guest 按运行时间将重型 mobile-reading-surface 矩阵与其余文件分组，admin 按测试级别分片；显式 serial 分组仍由 Playwright 约束。Web Demo 在同一 runner 启用测试级并行并使用四个 worker，保留全部桌面/移动场景。

验证命令：`bun run check`、`bun test tests/server/run-e2e.test.ts`、Playwright `--list` 复用生产入口 `getProjectTestArgs` 的完整参数进行清单并集/交集对照、完整 CI/CD Pipeline 与 E2E Tests。

7–8 分钟是本轮实验目标，不是已有性能证明；最终结论必须绑定当前候选 SHA，并分别给出冷/热缓存和 runner total 对照。
