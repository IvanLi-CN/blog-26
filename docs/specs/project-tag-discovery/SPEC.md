# 项目标签原生发现

## Context and Scope

项目分类需要与文章、闪念共享原生标签发现能力。范围以 ADR 0013 为准；不改变项目 MDX、领域、海报或文章存储，不迁移数据库，不扩展内联语法，不自动运行 AI 分组，不给项目编造日期。

## Terms and Interfaces

- 项目目录：仓库维护的项目身份、排序及标签来源。
- 标签目录：按实体去重、包含祖先的公共或授权管理读取模型。
- 快照：`tags.projectsByTag: Record<string, string[]>`。
- `/api/public/tags/timeline` 与对应 tRPC：`projects` 与 dated `items` 并列。

## Requirements

### REQ-TAGS-001

项目目录 MUST 是项目身份及标签的唯一来源，严格使用 ADR 0013 的 15 项英文标签和五项兼容写法。首页 featuredTags MUST 是完整标签子集且最多两项，并使用获批的六组技术栈摘要。

### REQ-TAGS-002

统一目录 MUST 合并符合读取权限及既有素材有效性条件的文章、闪念与目录项目。标签采用 NFC、分段去空白、移除前导 # 与空层；保留大小写、内部空格、+、²。每种实体每个路径含祖先最多计一次，count MUST 等于 postCount、memoCount、projectCount 之和。闪念标签合并存储与现有内联解析结果。

### REQ-TAGS-003

快照 MUST 提供 projectsByTag 的 slug 引用，并在读取旧快照时从公开文章/闪念与当前项目目录重建标签摘要、关联及 dated 时间线，保留生成时间及内容。公共分组和图标引用 MUST 仅包含公开目录标签；无分组归 Other，无图标使用原生回退。

### REQ-TAGS-004

标签时间线 API MUST 提供完整 projects 集合及原有 items、nextCursor、hasMore。项目按目录排序且不随 cursor 缩减；dated 内容先精确或后代匹配并过滤权限，再按日期和 id 降序分页。文章查询 MUST 保持文章专用。后台分组、图标、AI 输入及 MCP 标签列表 MUST 使用统一目录，读取不得写入数据库。

### REQ-TAGS-005

项目标签 MUST 使用无 hydration 的原生标签链接组件。标签索引 MUST 显示分类型计数；详情先呈现无日期项目紧凑条目，再呈现文章/闪念时间线。桌面项目条目 MUST 使用原生卡片；移动端 MUST 使用原生连续阅读行。项目条目 MUST 展示 Logo 或 Icon，优先复用现有项目资源；展示区域保持 1:1，非方形资源按原比例完整展示，禁止裁切或拉伸。项目独有标签 MUST 显示 dated 空状态且生成合法空 RSS；未知标签 MUST 返回 404。布局、焦点、主题和触控尺寸 MUST 遵守 Nature UI 响应式合同。

在小于 640px 的视口中，标签 MUST 使用 13px 字号及 26–28px 的单行可见胶囊，长标签允许自然换行。项目标签清单 MUST 减少横向留白并移除额外行间距；标签实际点击区域 MUST 保持至少 44px，紧凑呈现不得造成命中区域重叠。

## Verification

### VER-TAGS-001

- Method: 目录与 ADR 清单审计；首页子集断言。
- covers: `REQ-TAGS-001`
- Pass condition: 对应合同的计数、过滤、兼容、交互及路由断言全部成立。

### VER-TAGS-002

- Method: 纯聚合器、授权读取测试；React 的 10 个项目加文章与闪念总数为 12；I²C 不等于 I2C。
- covers: `REQ-TAGS-002`
- Pass condition: 对应合同的计数、过滤、兼容、交互及路由断言全部成立。

### VER-TAGS-003

- Method: 旧快照及 preloaded bundle 测试；新增与移除目录关联检查。
- covers: `REQ-TAGS-003`
- Pass condition: 对应合同的计数、过滤、兼容、交互及路由断言全部成立。

### VER-TAGS-004

- Method: 分页、后台、MCP 和元数据测试；大小写与 SQL 通配符隔离；AI 保留规范名称。
- covers: `REQ-TAGS-004`
- Pass condition: 对应合同的计数、过滤、兼容、交互及路由断言全部成立。

### VER-TAGS-005

- Method: 共享组件 Storybook 与受控真实模板 ui_demo；桌面及 393、375、360、320px light/dark 导航、几何和 RSS 断言。
- covers: `REQ-TAGS-005`
- Pass condition: 对应合同的计数、过滤、兼容、交互及路由断言全部成立。

## Related ADRs

- [项目目录与内容边界](../../adr/0001-project-detail-mdx-authoring.md)
- [公共移动内容流](../../adr/0003-public-mobile-content-stream.md)
- [原生项目标签发现](../../adr/0013-native-project-tag-discovery.md)

## Visual Evidence

- None

## References

- [Nature UI](../nature-front-ui/SPEC.md)
- [Implementation](./IMPLEMENTATION.md)
- [History](./HISTORY.md)
