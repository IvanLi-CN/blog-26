# CI 执行效率

## Context and Scope

本主题约束完整 CI 的编译复用、独立验证调度、测试分层和 E2E 分片。优化同时面向 required wall-clock 和 runner total；平台排队、基础设施故障与执行时间分别报告，不把单次运行当作 SLA。产品发布与 required checks 策略由原合同拥有。

## Terms and Interfaces

- `ci-project`：单个 canonical E2E project 的 CI 入口，浏览器 project 先准备不可变构建，再启动隔离的测试进程；纯后端 project 只准备真实后端所需的数据与运行时。
- 原生模块缓存：由固定工具链、Linux 镜像身份、目标架构、源码和 Cargo 锁文件确定的可重建输入。

## Requirements

### REQ-CI-001

系统 MUST 保留全部适用 required checks、原有测试意图和失败传播边界；需要渲染的覆盖保留真实字体、浏览器及产品构建。独立检查可提前执行，但所有 required checks 仍须成功。

### REQ-CI-002

系统 MUST 在每次消费原生模块后执行运行时验证，缓存缺失时从源码编译；输入或平台身份变化 MUST 使缓存失效。

### REQ-CI-003

CI 分片 MUST 完整且不重叠地覆盖 canonical project 测试集合，每个分片使用独立数据库、可写内容、应用及媒体端口、容器名和报告目录；任何分片失败或启动失败 MUST 使所属检查失败。共享构建在所有分片开始前完成，分片不能重新构建共享目录。

### REQ-CI-004

性能结论 MUST 同时记录完整 workload 的墙钟、runner total、run/job 数、cache/artifact 字节和 retention，区分冷缓存、命中与部分命中、排队及重试。相同完整 workload 的 runner total MUST 不增加，不能通过删测、放宽 gate 或扩大 job 数获得收益。

### REQ-CI-005

测试分层 MUST 为迁移的每项断言提供明确的等价覆盖：请求参数、持久化与业务状态使用真实处理器或正式 Demo 适配器验证；布局、焦点、输入、导航与浏览器 Cookie 行为继续使用浏览器。固定自身 viewport 的用例可只执行一次，但 MUST 保留它内部的全部桌面和移动场景。纯后端检查 MUST 保留真实 HTTP、认证、存储和失败传播，不得以 mock 服务替代正式网关。

### REQ-CI-006

图片生成 MUST 按源图内容、生成配方、编码器和运行平台复用可重建的单图缓存；提交身份不属于图片输入。每次命中 MUST 校验产物与元数据，损坏、缺失或不可用缓存 MUST 回退到生成，真实生成失败仍阻断构建。当前源图集合 MUST 决定稳定 manifest 与受管理产物清理，公共图片 URL、质量和预算保持兼容。

### REQ-CI-007

Actions MUST 以同平台和配方的聚合包复用单图缓存，不新增 producer 等待依赖；Docker MUST 将图片生成与应用源码及构建身份分层。性能证据 MUST 包含冷、暖、单图失效、恢复与保存成本；暖图片阶段含恢复校验开销的中位数须比同平台冷生成降低至少 70% 且净节省至少 45 秒。

## Verification

### VER-CI-001

- Method: 工作流与质量合同对照、Actions 完整检查结果。
- covers: `REQ-CI-001`, `REQ-CI-002`
- Pass condition: required checks 名称及覆盖不变；冷缓存编译、每次消费验证均成功，独立检查失败仍阻止合并。

### VER-CI-002

- Method: 文件复制与端口隔离测试、Playwright 测试清单并集/交集对照、真实 CI 分片运行。
- covers: `REQ-CI-003`
- Pass condition: 分片清单并集等于全量且交集为空；写入一个分片不影响其他分片与原始 fixture，所有分片退出结果均参与最终结果。

### VER-CI-003

- Method: 相同工作负载的重复冷/热缓存运行对照。
- covers: `REQ-CI-004`
- Pass condition: 收益报告包含双指标和传输资源；完整 workload 的 runner total 不增加，所有适用覆盖成功。

### VER-CI-004

- Method: 断言迁移映射、真实 SQLite/正式 Demo 适配器组件测试、生产 Playwright 配置与用例清单审计、完整 Actions 运行。
- covers: `REQ-CI-001`, `REQ-CI-005`
- Pass condition: 被下移的断言全部通过非浏览器测试；真实交互和内部 viewport 场景仍被执行；MCP 在无浏览器及前端产物的准备路径下通过真实 HTTP 链路。

### VER-CI-005

- Method: 图片生成器兼容、增量、损坏、路径、并发测试与 Actions 冷暖性能对照；Docker 临时上下文变更实验。
- covers: `REQ-CI-006`, `REQ-CI-007`
- Pass condition: 冷暖产物相同，单图变化只重建对应条目，缓存故障安全回退；无关应用与构建身份变化不使 Docker 图片层失效，源图变化使其失效；达到图片阶段净收益阈值，保留全量构建及测试门禁。

## Related ADRs

- [0042 原生产物与薄运行镜像](../../adr/0042-native-runtime-bundle-and-thin-image.md)

## References

- [E2E 合同](../../../tests/e2e/README.md)
- [质量门禁](../../../.github/quality-gates.json)
