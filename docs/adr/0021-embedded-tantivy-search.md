---
status: superseded
superseded_by: 0023-search-legacy-compatibility.md
---

# 使用内嵌 Tantivy 承载三种搜索模式的全文检索

三种搜索模式共用内嵌 Tantivy 持久化全文索引，经 Node-API 接入 Bun；引擎负责索引与排名，项目负责受控查询编译、权限、同步和搜索编排。原生 Linux 探针已证明 Bun 接入、内置分析器的有限匹配矩阵和合成同步恢复可行；组件选型成立，产品集成与发布验收仍须完成，不能把探针当作生产实现。

现有 SQLite trigram 不满足确认的名称边界，MiniSearch 的既有 Playbook 配置也不能复用为文章与 Memo 的合格实现；外置服务虽被允许，但增加部署与同步责任。Tantivy 保留内嵌、磁盘索引与成熟排名能力，代价是维护原生绑定、目标平台构建和实际发行物验证；SQLite 继续承担既有运行投影与同步事件存储，Tantivy 索引可重建。

本 ADR 关于 `NEAR(...)` 的结论已由 [ADR 0023](./0023-search-legacy-compatibility.md) 取代。新 Tantivy 查询保持受控语法；对旧入口中的位置查询，适配层继续委托既有 SQLite 查询执行器，保留原语义。

支持的字段、布尔、短语、前缀、中文片段及名称规则仍须由受控适配层准确落实；不能直接转发到 Tantivy 原生 QueryParser 或缩减这些规则来迎合默认行为。索引同步、权限、恢复、原生发行物与真实内容成本的验收边界见 [搜索契约](../specs/search-relevance/SPEC.md) 和 [组件证据](../specs/search-relevance/VALIDATION.md)。
