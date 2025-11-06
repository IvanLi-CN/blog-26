# AI 标签分组助手规格说明

## 背景与目标

站点的标签体系长期依赖手工维护，组别数量不均、语义重复的情况频繁出现，且随着内容量增长调整成本升高。AI 标签分组助手旨在在管理员后台提供一套“请求→审核→提交”的自动化分组流程：

- 动态读取数据库中最新的标签与使用频次；
- 引导语言模型在严格提示词约束下生成均衡、语义清晰的分组；
- 管理员确认后保存到 `src/config/tag-groups.json`，供 `/tags` 页面与其他依赖方读取。

## 范围

- In scope
  - 管理员界面 `/admin/tags` 的 AI 分组面板交互（生成草稿、生成并保存、手动保存、回退）
  - 服务端 API `/api/tags/organize`（GET/POST/PUT）权限校验、请求转发、结果校验与持久化
  - 提示词构建、调用重试与响应验证逻辑（`src/server/services/tag-ai.ts`）
  - 本地 `tag-groups.json` 配置文件的写入与校验

- Out of scope
  - 标签本体的增删改（仍由内容录入流程维护）
  - 非管理员可见的任何入口
  - 多模型对比评估、自动 A/B 测试

## 角色与入口

- **管理员**：访问 `/admin/tags`，需具备 `isAdminFromRequest` 或匹配 `ADMIN_EMAIL` 的 SSO 头；
- **服务端**：`/api/tags/organize` 强制 `isAdminRequest` 校验；
- **配置读者**：公开站点在构建 `/tags` 页时读取最新分组配置。

## 系统架构

```
Admin UI (TagOrganizerPanel)
    ├─ GET  /api/tags/organize       → 读取当前配置
    ├─ POST /api/tags/organize       → 请求 AI 生成（可选择持久化）
    └─ PUT  /api/tags/organize       → 手动保存工作区内容

Server services
    ├─ getTagSummaries()             → 聚合标签名称/分段/次数
    ├─ organizeTagsWithAI()          → 组装提示词、调用模型、验证响应
    └─ tag-groups-config             → 读写配置并执行 schema 校验

Persistence
    └─ src/config/tag-groups.json    → 与 `/tags` 页面共享的最终分组文件
```

## 主要流程

1. **加载页面**：
   - 服务端组件读取现有分组与标签统计，注入到 `TagOrganizerPanel`；
   - 前端初始化“模型历史”下拉（localStorage 记忆最近 5 个模型）。

2. **生成草稿**：
   - 用户选择目标分组数、模型名后点击“生成草稿”；
   - 前端 POST `/api/tags/organize`，附带 `targetGroups`（必填）与 `model`（可选）；
   - API 校验管理员权限 → 调用 `organizeTagsWithAI` → 返回分组草稿，同时给出 `notes`、`model`；
   - 前端展示分组卡片、覆盖率统计、AI 备注，并将结果写入浏览器 `localStorage` 中的草稿堆栈（倒序，最多 10 份，可随时加载或删除）。

3. **生成并保存**：
   - 流程同上，但携带 `persist: true`；
   - API 在写入前用 `validateTagGroupsConfig` 二次校验，再落盘 `tag-groups.json`。

4. **手动保存草稿**：
   - 管理员可在草稿基础上调整后点击“保存草稿”；
   - 触发 PUT `/api/tags/organize`，直接写入最新配置。

5. **重置**：回退到页面初始加载的配置。

## 提示词规范（服务端）

- **系统提示**：要求模型只输出 JSON，无法满足须返回 `{"error":"reason"}`。
- **用户提示结构**（动态拼接）：
  1. 总标签数与目标分组数；
  2. 自动计算理想组容量（floor/ceil），提供差值 ≤1 的硬约束；
  3. 标签目录：`<tag path> | segments: a > b | usage=n`；
  4. 明确七条规则（禁止重命名、标题为专业名词、Slug Key、语义聚类、均衡限制、`summaryTitle` 必填等）；
  5. JSON Schema 描述（含 `summaryTitle` 与 `notes`）；
  6. 正反例示范（展示 Content vs Platform 的期望格式）。
- 温度设为 0.2，最多重试 3 次（对 408/429/5xx 进行线性退避）。

## API 契约

### GET `/api/tags/organize`

- 权限：管理员；
- 响应：`{ success: true, data: { groups: TagGroup[] } }`。

### POST `/api/tags/organize`

- 入参：`{ targetGroups: number, model?: string, persist?: boolean }`；
- 输出：
  - 成功：`{ success: true, data: { groups, notes?, model? } }`；
  - 失败：`500`（AI 报错/解析失败）、`422`（持久化校验失败）。

### PUT `/api/tags/organize`

- 入参：`{ groups: TagGroup[] }`；
- 校验：所有标签必须存在且唯一；
- 输出：`{ success: true }` 或相应错误码。

## 管理端 UI 要点

- 表单项：目标分组数（2-20）、模型名称（支持 datalist 历史）；
- 按钮：生成草稿、生成并保存、保存草稿、重置；
- 状态提示：成功/错误徽章、覆盖率与重复标签提示、AI summary 与 notes 展示；
- 草稿面板：左侧列展示最近生成的草稿（含模型名、时间、删除/清空功能），点击可回填到主预览。
- 模型历史：localStorage 记忆最近 5 个手动输入。

## 失败场景与处理

- AI 返回非 JSON / 缺字段 → 服务端直接抛出 500，前端显示 “AI 整理失败”；
- 未授权访问 → 403；
- 标签校验失败（缺失/重复）→ 422，前端提示错误并保留草稿；
- 持久化异常（文件写入失败等）→ 500；
- LLM 限流/超时 → 自动重试，最终仍失败则抛出错误信息。

## 配置与环境变量

- `OPENAI_API_KEY` / `OPENAI_API_BASE_URL`：模型调用凭证（必填）；
- `TAG_AI_MODEL`、`CHAT_COMPLETION_MODEL`：默认模型名称回退；
- `TAG_AI_MAX_RETRY`：最大重试次数（默认 3）；
- `TAG_GROUP_COUNT`：默认目标分组数（无配置时使用现有配置或 8）。

## 日志与观测

- `organizeTagsWithAI` 在控制台输出 `[ai-tag-organize attempt x/y]` timing 与错误详情；
- 持久化成功/失败目前不写入额外日志，后续可接入 Winston 或平台日志。

## 安全考虑

- 所有 API 均要求管理员身份；
- 不在公开页面渲染 AI 操作入口，避免暴露给普通用户；
- 输入提示中严禁透出 API Key，管理员仅提供模型名称；
- 后端抛出的错误信息做最小披露（不返回堆栈）。

## 验收清单

- [ ] 管理员可成功生成草稿并落盘配置；
- [ ] AI 输出的每个标签准确对应数据库中的完整路径；
- [ ] 前端统计显示覆盖率、缺失与重复，且能在重试后更新；
- [ ] `/tags` 页面读取新配置并正确渲染；
- [ ] 无管理员权限访问 `/admin/tags` 时重定向到 `/admin-login`。

## 后续优化方向

- 记录每次 AI 调用的输入/输出快照，方便回溯与离线评估；
- 引入“示例分组”库，针对常见标签模式提供参考主题；
- 增加分组编辑拖拽能力，降低手动重排成本；
- 将模型错误与限流信息上传到监控平台，便于运营排查；
- 支持多模型对比（例如先请求自家模型，再请求开源模型），管理员选择最佳方案。
