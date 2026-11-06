# 主题背景

PR #451 从 Ubuntu 镜像长尾与重复 runtime 构建收敛，扩大为原生模块复用、独立检查调度和隔离 E2E 分片。覆盖和失败传播保持等价，性能收益通过真实 Actions 样本验证。

后续测试分层以正式处理器、真实 SQLite 和正式 Demo 适配器承接业务断言，保留浏览器交互与真实 HTTP 边界；MCP 使用生产网关的后端准备路径。固定自身 viewport 的 project-runtime-motion 从重复外层矩阵中移出一次，内部移动场景仍保留。
