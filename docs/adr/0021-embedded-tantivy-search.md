---
status: accepted
---

# 使用内嵌 Tantivy 承载三种搜索模式的全文检索

三种搜索模式共用内嵌 Tantivy 持久化全文索引，经 Node-API 接入 Bun；引擎负责索引与排名，项目负责受控查询编译、权限、同步和搜索编排。原生 Linux 探针已证明 Bun 接入、内置分析器的有限匹配矩阵和合成同步恢复可行；组件选型成立，产品集成与发布验收仍须完成，不能把探针当作生产实现。

现有 SQLite trigram 不满足确认的名称边界，MiniSearch 的既有 Playbook 配置也不能复用为文章与 Memo 的合格实现；外置服务虽被允许，但增加部署与同步责任。Tantivy 保留内嵌、磁盘索引与成熟排名能力，代价是维护原生绑定、目标平台构建和实际发行物验证；SQLite 继续承担既有运行投影与同步事件存储，Tantivy 索引可重建。

新三种模式及 enhanced 入口不支持旧 `NEAR(...)` 语法，返回明确的不支持错误，不静默按普通文字执行。NEAR 是旧 SQLite 位置语法，其兼容成本不服务于本次核心需求，因此不作为 Tantivy 选型门槛；独立 semantic 与内容列表仍由旧主题维护，保留原解析与 SQLite NEAR 行为，不删除共用解析器能力。

支持的字段、布尔、短语、前缀、中文片段及名称规则仍须由受控适配层准确落实；不能直接转发到 Tantivy 原生 QueryParser 或缩减这些规则来迎合默认行为。索引同步、权限、恢复、原生发行物与真实内容成本的验收边界见 [搜索契约](../specs/search-relevance/SPEC.md) 和 [组件证据](../specs/search-relevance/VALIDATION.md)。
