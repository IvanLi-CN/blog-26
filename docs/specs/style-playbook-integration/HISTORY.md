# Style Playbook集成主题历史

## Lifecycle / Compatibility

本主题是 active 的长期需求主题。博客原生阅读集合与 console 跟随博客已部署版本的架构边界记录在 [ADR 0011](../../adr/0011-published-playbook-read-model.md)。文章与 Memo 的实时 console 边界继续由 [ADR 0010](../../adr/0010-self-contained-console-runtime.md) 定义。

以下保存初始研究基线及其设计影响。核对时间为 2026-10-02；上游源码基线为 `9156e9f68e5659927b1c5960a3f1ce783b7d7f44`。这些来源事实不代表能力已经实现；当前覆盖见 [IMPLEMENTATION.md](./IMPLEMENTATION.md)。

## 来源身份与已发布产物

通过 `gh repo view IvanLi-CN/style-playbook-skills` 与 `gh api repos/IvanLi-CN/style-playbook-skills` 核实：仓库规范身份仍为 `IvanLi-CN/style-playbook-skills`，`private=true`、`visibility=private`、默认分支为 `main`。来源链接为 [上游仓库](https://github.com/IvanLi-CN/style-playbook-skills)。匿名网页/API 返回 404 与其私有状态一致，Git clone 成功不能证明匿名可读。

`gh release view` 查询到最新 Release `v2.3.2`，发布于 `2026-09-26T06:28:47Z`，其 tag 解析到 `8005cb01fe64dc35062809e57e3fa696d91c3679`；API 返回 `assets=[]`。见 [该 Release](https://github.com/IvanLi-CN/style-playbook-skills/releases/tag/v2.3.2)。Release 对象和当前 `main` 是不同输入，不能用当前分支内容冒充该已发布版本。

设计影响：博客 CI 需要明确的上游只读权限，或上游单独发布可公开消费的导出物。访客、浏览器与 console 不能依靠匿名访问私有 Release；GitHub 读取凭据应停留在构建边界。

## 上游已经提供的公开契约

上游 [README](https://github.com/IvanLi-CN/style-playbook-skills/blob/9156e9f68e5659927b1c5960a3f1ce783b7d7f44/README.md) 区分公开 SSG 与内部管理 CSR。公开目录由 Rust CLI `export-public-data` 生成，搜索由 `export-public-search` 生成；前端读取该目录生成页面。

[read_model.rs](https://github.com/IvanLi-CN/style-playbook-skills/blob/9156e9f68e5659927b1c5960a3f1ce783b7d7f44/src/read_model.rs#L274) 的 `load_public_catalog`：

- 读取 checked-in visibility 元数据，缺失或非法时失败。
- 要求公开项目具有已提交的经验快照。
- 去除私有项目、关联非公开项目的 Topic 和内部 Policy Skill。
- 校验公开 Policy Skill、依赖可见性及公开 URL 契约。
- 序列化前执行 `privacy::validate_public_value`，检测失败则不产生成功结果。

[models.rs](https://github.com/IvanLi-CN/style-playbook-skills/blob/9156e9f68e5659927b1c5960a3f1ce783b7d7f44/src/models.rs#L118) 定义 `PublicProjectListItem` / `PublicProjectDetail`、`PublicTopicListItem` / `PublicTopicDetail`、`PublicPolicySkillDetail` 与 `PublicCatalog`；公开结构移除了生成历史、thread ID、仓库本机路径及选中参考项目等内部字段。目录不含独立的六组 Skill/读写 Skill 文档集合。

设计影响：博客复用公开目录，避免重新扫描原始 Markdown 或复制内部 API 数据。现有目录可支撑 Topic、项目实践和 Policy Skill 的原生页；浏览全部技能主文档需要新增上游公开契约。

## 上游 SSG 与 Release 的差距

[web/package.json](https://github.com/IvanLi-CN/style-playbook-skills/blob/9156e9f68e5659927b1c5960a3f1ce783b7d7f44/web/package.json) 的 `build:public` 依次导出目录、搜索、静态资源与 HTML。

[render-public.tsx](https://github.com/IvanLi-CN/style-playbook-skills/blob/9156e9f68e5659927b1c5960a3f1ce783b7d7f44/web/scripts/render-public.tsx#L41) 生成：

- `web/dist-public/data/catalog.json`：目录索引；这不是包含全部详情的 `PublicCatalog`。
- `data/projects/<slug>.json` 和 `data/topics/<slug>.json`：详情数据。
- `data/search-documents.json`：公开搜索文档。
- `/projects/`、`/projects/<slug>/`、`/topics/`、`/topics/<slug>/`：完整 HTML 与公开 bootstrap。

输出检查拒绝 `settings/`、`generations/` 和 `api/internal/` 路径。[CI Main](https://github.com/IvanLi-CN/style-playbook-skills/blob/9156e9f68e5659927b1c5960a3f1ce783b7d7f44/.github/workflows/ci-main.yml) 构建公开 SSG，并检查生成产物及 gitleaks。

所检查的 [Release workflow](https://github.com/IvanLi-CN/style-playbook-skills/blob/9156e9f68e5659927b1c5960a3f1ce783b7d7f44/.github/workflows/release.yml#L327) 发布 Docker 镜像并创建 GitHub Release，没有上传公开 JSON 或 SSG Release asset 步骤。此结论限定于该源码基线和已查询的 Release，不代表所有外部部署渠道。

设计影响：应在上游 release 流程中补充固定版本的公开数据资产；博客原生页消费数据，不需要复制上游 React 页面或运行 Rust 管理服务。

## 博客已有的发布与运行边界

[astro.config.mjs](../../../astro.config.mjs) 在 `CONSOLE_RUNTIME=true` 时输出 Astro server 到 `console-dist`，否则输出 static 到 `site-dist`。[site/lib/public-site.ts](../../../site/lib/public-site.ts) 的 `getSnapshot` 在 console 中执行 `buildPublicSnapshot`，静态构建则读快照文件。[export-public-site-data.ts](../../../scripts/export-public-site-data.ts) 创建或复用该文件。

[ADR 0010](../../adr/0010-self-contained-console-runtime.md) 明确 console 是自包含 SSR 应用；公开静态站与 console 的实时 Memo 可以有不同新鲜度。该实时边界不自动适用于尚未接入的Playbook。

按照 [产品发布合同](../manual-version-release/SPEC.md)，静态前台与完整功能 Docker 镜像共享同一产品版本。Playbook 的静态产物和 console 读取的内容身份继续遵循本主题的公开包与已部署指针合同；应用发布准备和实际发布的实现状态见 [发布实现状态](../manual-version-release/IMPLEMENTATION.md)。

[fetch-public-content-bundle.sh](../../../scripts/fetch-public-content-bundle.sh) 即使设置 snapshot URL 仍要求 bundle URL；刷新后用 console 返回的 posts/memos/tags 覆盖下载快照。它不能直接承接 Playbook 数据。

设计影响：新增独立的Playbook数据输入与内容更新入口，复用静态构建/校验/部署步骤。避免把Playbook塞进依赖 console 的现有快照，以及避免每次内容更新都发布应用版本和镜像。

## 搜索边界

[search-model.ts](../../../src/components/search/search-model.ts) 当前只定义 `post` / `memo` 结果和 `/posts/<slug>` / `/memos/<slug>` 目标。[SearchPageIsland.tsx](../../../site/components/SearchPageIsland.tsx) 调用 console 公共搜索 API。

设计影响：统一搜索需要新增Playbook结果类型及显式 URL；上游搜索文档中的 `/projects`、`/topics` 与 section anchor 必须映射到Playbook命名空间。目录/详情/搜索应绑定同一个版本，不能伪装成文章来复用 posts 表。

## 搜索内容身份与命中位置

整页、章节和命令是检索粒度，不是读者看到的独立内容身份。将每个搜索文档直接呈现为顶层结果，会让一篇长文反复出现，并占据结果名额；仅按标题去重会误合并同名内容，而直接丢弃章节命中会损失精确定位能力。

统一搜索因此采用“一个内容搜索结果，多个章节子结果”的呈现边界：按规范内容身份聚合，保留权威主标题与最佳匹配片段，默认直接显示最多三个不同的匹配章节，其余在同一主结果内展开。来源分组保留；内容排名取最高有效命中相关性，数量上限与计数按聚合后的内容计算，防止章节数量影响顶层排名或挤掉其他内容。

按内容聚合、保留章节定位以及默认显示最多三个子结果的方向在需求访谈中由主人确认，长期约束与验收分别见 `REQ-PBI-012` 至 `REQ-PBI-014` 和 `VER-PBI-012` 至 `VER-PBI-014`。实现覆盖与源码勘察限制记录在 [IMPLEMENTATION.md](./IMPLEMENTATION.md)。该结果组织方式可以在现有阅读与搜索边界内调整，不引入新的持久身份体系或检索服务，因此不另设架构 ADR。

主人补充要求高亮只强调匹配文字，不增加左右留白或影响原文排版。搜索高亮因此采用不占布局空间的颜色与背景强调，保持原有文本、字体与字重；验收同时比较文字与浏览器几何，避免只删除字符串空格却继续保留内边距或加粗造成的宽度变化。长期约束与验收见 `REQ-PBI-015` 和 `VER-PBI-015`。

## GitHub 自动触发约束

[GITHUB_TOKEN 官方说明](https://docs.github.com/en/actions/concepts/security/github_token) 明确 token 权限限于 workflow 所在仓库；它产生的事件通常不会新建 workflow run，`workflow_dispatch` 与 `repository_dispatch` 是例外。因此不能依靠上游由该 token 创建的 Release 再自动触发独立 `release: published` workflow。

[workflow_dispatch REST 接口](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event) 支持 fine-grained token，需要目标仓库 `Actions: write`。[repository_dispatch REST 接口](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event) 则需要 `Contents: write`。[workflow 事件文档](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) 说明相关 workflow 应存在于默认分支。

设计影响：上游成功发布数据后显式 dispatch 博客 workflow，或由博客定时检查补漏；跨仓库调用使用明确授予的目标仓库凭据。dispatch 参数应由接收端重新核对，不能把通知本身当作已验证内容。

## 验证限制

本研究使用 `gh` 只读接口、固定上游源码及博客工作区源码。代码图工具不可用，结构结论使用源码核对。未核实 EdgeOne 控制台配置、fine-grained PAT 可用性或实际跨仓触发，没有导出可公开实体的数量，也没有上传、触发 workflow 或更改私有仓库可见性。

## References

- [长期需求](./SPEC.md)
- [实现状态](./IMPLEMENTATION.md)
- [ADR 0011](../../adr/0011-published-playbook-read-model.md)

## 搜索聚合实现边界

搜索聚合以 `ea9fcea19ab9546a9c1b4456d54500866f567540` 为开发起点，保留已确认的需求和术语文档改动。交付同步到 `295f37394cc8f649bd501a353e2670a58dd5a816`，保留主线的 Web Demo 正式路由证据约定与组件 Storybook 边界；搜索组件交互继续在 Storybook 验证，页面截图使用独立 Web Demo。

实现将搜索文档身份与内容身份分开，不修改上游公开索引格式或公开搜索数组 API；数据库行、向量命中与章节数量都不作为顶层结果数。旧的短文本原始行截断会让重复路由耗尽候选，已改为排名、内容去重之后再截断。高亮使用继承上下文排版的内联 mark，浏览器同时验证字符位置和复制文本。

主人拒绝首组搜索截图，要求展示更加自然、美观。后续调整只收敛结果卡片的视觉层级、摘要密度与悬停反馈，保留聚合身份、入口、排序、展开和高亮无排版影响的既定契约；正式视觉资产仍以当前截图确认作为门禁。

主人随后指出展示奇怪，并质疑是否符合常规搜索结果的阅读习惯。分析认为原有章节竖线、分隔和箭头过于接近目录面板，因此收窄结果列，将章节改为主结果内部的紧凑附属链接。短预览选择匹配所在段落，保留原文字切片；几何比较同时覆盖主摘要和两种章节宽度。

主人确认附属链接层级更清晰，并指出桌面右侧空白不合适。结果卡片恢复内容区全宽，与查询面板两侧对齐，保留紧凑摘要和章节附属链接；桌面交互场景增加对齐断言。

主人指出直接铺满仍像硬拉宽，明确要求大屏幕使用左侧操作、右侧结果的双栏布局。搜索输入、分类筛选与建议词集中到左栏；小屏保持上下排列，聚合、展开、缓存与高亮契约不变。建议词复用现有来源和点击行为，没有建议时使用输入框已有的示例词，不增加搜索请求。
