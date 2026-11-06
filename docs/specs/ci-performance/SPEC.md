# CI 执行效率

## Context and Scope

本主题约束完整 CI 的编译复用、独立验证调度和 E2E 分片。优化同时面向 required wall-clock 和 runner total；平台排队、基础设施故障与执行时间分别报告，不把单次运行当作 SLA。产品发布与 required checks 策略由原合同拥有。

## Terms and Interfaces

- `ci-project`：单个 canonical E2E project 的 CI 入口，先准备不可变构建，再启动隔离的测试进程。
- 原生模块缓存：由固定工具链、Linux 镜像身份、目标架构、源码和 Cargo 锁文件确定的可重建输入。

## Requirements

### REQ-CI-001

系统 MUST 保留全部适用 required checks 和原有测试断言、字体、浏览器、产品构建与失败传播边界。独立检查可提前执行，但所有 required checks 仍须成功。

### REQ-CI-002

系统 MUST 在每次消费原生模块后执行运行时验证，缓存缺失时从源码编译；输入或平台身份变化 MUST 使缓存失效。

### REQ-CI-003

CI 分片 MUST 完整且不重叠地覆盖 canonical project 测试集合，每个分片使用独立数据库、可写内容、应用及媒体端口、容器名和报告目录；任何分片失败或启动失败 MUST 使所属检查失败。共享构建在所有分片开始前完成，分片不能重新构建共享目录。

### REQ-CI-004

性能结论 MUST 同时记录完整 workload 的墙钟、runner total、run/job 数、cache/artifact 字节和 retention，区分冷缓存、命中与部分命中、排队及重试。相同完整 workload 的 runner total MUST 不增加，不能通过删测、放宽 gate 或扩大 job 数获得收益。

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

## Related ADRs

None

## References

- [E2E 合同](../../../tests/e2e/README.md)
- [质量门禁](../../../.github/quality-gates.json)
