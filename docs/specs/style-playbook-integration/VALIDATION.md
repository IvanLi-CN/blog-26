# 内容同步数量与 RAG 覆盖验证

## 范围与隔离

本次验证只使用会话 Agent VM、隔离 SQLite/公开包及确定性 Mock 提供方，不读取生产语料或提供方凭据，不执行真实 chat/embedding 调用。原计划 A6 真实提供方实证已按主人明确约束替换为 Mock 链路验收；它证明生成、持久化、重启、统计和消费一致性，不证明外部服务可用性或真实模型质量。生产旧向量与空 Playbook 投影仍需另行运行数据修复。

## 确定性验证

| 项目 | 执行与结果 | 证明边界 |
| --- | --- | --- |
| 仓库回归 | 同步主线 `3c27879614501400de8d3254703c06c58721d65b` 后，`bun run test --timeout 30000`：1149 pass、0 fail、5081 assertions、137 files；故障注入由非 root `validator` 用户执行 | 包含恢复、准入、取消、配置变化、目标聚合、接口兼容和既有搜索；延长单测执行预算不改变产品超时 |
| 原生引擎 | `bun run search:native:build && bun run search:native:verify` 通过 | Linux ABI、提交后增删/reader reload、异步查询、稳定同分顺序与前缀预算 |
| 迁移 | `bun run db:migrations:validate` 通过；0015 snapshot 的原有表与 0014 逐对象一致 | 新增五张前向表，不清空旧内容或历史向量 |
| Mock 跨进程重启 | `tests/lib/rag-index-restart.test.ts` 启动独立 write/read 进程：4 个父内容、6 个分块；新增中断恢复、取消后重启和从 0014 旧向量/缓存升级的独立进程场景 | 阻断任何非合成端点请求；完整投影重启读取只允许两次查询向量调用，不隐式补建；中断恢复保留原 taskId、完整目标及成功进度，即使原 edition 已成为 previous |
| 旧程序回读 | 实际 v3.3.0 源码 `f726db08e4046cd4f905a6d680e3aa37247321bc` 读取候选写入的隔离数据 | 旧内容、公开缓存、legacy semantic 查询与旧 vectorizeOneBySlug 写入均通过；不外推未验证旧版本 |
| 页面 | 正式 `/admin/content-sync` build-time Web Demo；三个视口和明暗主题 | 桌面 4 + 移动 4 个 E2E 全部通过；四摘要、六指标、分块详情、chip 范围、上一版只读、补建/取消和未知状态；移动截图使用 393×852 移动模拟单屏 |
| 构建 | Mock admin 与 Storybook 构建通过 | 页面不复制到 Storybook；可复用覆盖指标保留独立 Stories |

Mock 重启的重现入口为 `DB_PATH`、`LOCAL_CONTENT_BASE_PATH`、`PLAYBOOK_CACHE_DIR` 指向同一个临时目录，先执行 `tests/lib/rag-index-restart-fixture.ts write`，再在独立进程执行 `read`；测试封装管理完整合成配置和清理。旧程序回读使用候选 write 生成的数据目录，解包上述 baseline 的源码/迁移，在相同隔离配置中调用旧 db、cache、semanticSearchPosts 和 vectorizeOneBySlug；请求只路由到合成 Mock。

旧程序回读结果：

```json
{"baseline":"f726db08e4046cd4f905a6d680e3aa37247321bc","version":"v3.3.0","mock":true,"contentRead":true,"cacheRead":true,"semanticRead":true,"vectorWrite":true}
```

SHA 绑定的最终验证与正式审查由当前交付候选证据记录；本文件不将历史通过结果冒充新 Candidate 的终态。PR CI 另行核对当前 head，合并与生产补建的状态分别记录。

审查修复回归覆盖采用 checkpoint 与取消竞争、本地全量同步初始化时取消、原版本语义恢复与已被替代内容任务终止、任务内分批目标填充、凭据轮换/移除，以及管理员 HTTP 状态筛选、202 触发、分页、详情和精确取消。所有提供方响应由确定性 Mock 产生。

补充回归覆盖部分历史分块与未索引分块的区别、未知状态逐块分类、跨进程持久取消后的迟到失败、旧内容采用任务不回滚 current，以及本地取消后的完整工作量。

补充回归验证跨来源同 parentId 聚合、已有有效覆盖的重建失败与取消、本地并发请求 singleflight、冷启动自动注册后原任务恢复，以及全部来源复用本地期间仍采用 Playbook。历史回归核对真实 created 与兼容 added 字段；不能还原的历史变化数保持未知。
