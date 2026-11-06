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

## Related ADRs

None

## References

- [E2E 合同](../../../tests/e2e/README.md)
- [质量门禁](../../../.github/quality-gates.json)
