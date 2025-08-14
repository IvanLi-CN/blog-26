# Memo 功能迁移计划

## 📋 项目概述

本文档详细描述了从 old 项目迁移 memo 功能到当前 Next.js 项目的完整计划。

### 🎯 新需求

1. **memo 需要支持从 local 内容源中获取数据**
2. **发布 memos 时发布到默认的内容源（硬编码为 webdav）**
3. **memo 编辑器统一使用 UniversalEditor**

## 🏗️ 架构设计

### 数据流设计

- **读取流程**: Local Content Source + WebDAV Content Source → Content Source Manager → Database → API → Frontend
- **写入流程**: Frontend → API → WebDAV Content Source (默认) → Content Source Manager → Database Sync

### 与现有系统的集成点

- **数据库层**: 扩展现有的 memos 表，确保与 ContentItem 类型兼容
- **内容源层**: 扩展 WebDAVContentSource 添加写入功能
- **API 层**: 创建 memo 相关的 tRPC 路由，集成内容源管理器
- **前端层**: 使用 UniversalEditor，创建 memo 专用组件

## 📅 分阶段实施计划

### 阶段 1: 数据层适配 (Foundation) - 2-3天

#### 1.1 数据库 Schema 适配

- [ ] 确保现有的 memos 表与 ContentItem 类型完全兼容
- [ ] 添加必要的字段映射：source、filePath、contentHash、lastModified 等
- [ ] 创建数据迁移脚本，保持向后兼容

#### 1.2 内容源系统扩展

- [ ] 扩展 WebDAVContentSource 添加写入功能：
  - [ ] `createMemo(content, metadata)` - 创建新 memo
  - [ ] `updateMemo(id, content, metadata)` - 更新现有 memo
  - [ ] `deleteMemo(id)` - 删除 memo
- [ ] 确保 LocalContentSource 能正确识别 memo 文件（路径：`/memos/`）
- [ ] 测试内容源的读写功能

#### 1.3 内容同步验证

- [ ] 验证 memo 内容能正确从 local 和 webdav 同步到数据库
- [ ] 测试内容合并和冲突解决机制
- [ ] 确保多源数据的一致性

### 阶段 2: API 层实现 (Backend) - 2-3天

#### 2.1 Memo tRPC 路由器

- [ ] 创建 `src/server/routers/memos.ts`
- [ ] 实现基于内容源管理器的 CRUD 操作：
  - [ ] `getMemos` - 分页获取 memo 列表
  - [ ] `getMemoBySlug` - 获取单个 memo
  - [ ] `createMemo` - 发布新 memo 到 webdav
  - [ ] `updateMemo` - 更新现有 memo
  - [ ] `deleteMemo` - 删除 memo
- [ ] 集成现有的权限控制和错误处理机制
- [ ] 在 `src/server/router.ts` 中注册 memos 路由器

#### 2.2 发布功能实现

- [ ] 实现发布到 webdav 内容源的功能（硬编码默认）
- [ ] 添加附件上传支持，集成现有的文件上传 API
- [ ] 实现草稿和发布状态管理
- [ ] 支持标签自动提取和标题生成

### 阶段 3: 前端组件实现 (Frontend) - 2-3天

#### 3.1 Memo 编辑器组件

- [ ] 创建 `src/components/memos/MemoEditor.tsx`：
  - [ ] 基于 UniversalEditor，配置 memo 专用参数
  - [ ] `attachmentBasePath="Memos/assets"`
  - [ ] `contentSource="webdav"`（发布目标）
  - [ ] 添加 memo 特有的 UI（公开/私有切换、快速发布按钮）

#### 3.2 快速编辑器组件

- [ ] 创建 `src/components/memos/QuickMemoEditor.tsx`：
  - [ ] 基于 UniversalEditor 的轻量级封装
  - [ ] 添加草稿自动保存（本地存储）
  - [ ] 添加快速发布功能
  - [ ] 集成标签提取和状态管理

#### 3.3 列表和展示组件

- [ ] 创建 `src/components/memos/MemosList.tsx`：
  - [ ] 支持多源数据展示
  - [ ] 无限滚动分页
  - [ ] 时间线样式展示
  - [ ] 内容来源指示器
- [ ] 创建 `src/components/memos/MemoCard.tsx`：
  - [ ] 单个 memo 卡片展示
  - [ ] 支持预览和编辑切换
- [ ] 创建 `src/components/memos/AttachmentGrid.tsx`：
  - [ ] 附件网格展示
  - [ ] 图片预览和灯箱效果
  - [ ] 文件下载功能

#### 3.4 应用容器和 Hooks

- [ ] 创建 `src/components/memos/MemosApp.tsx`：
  - [ ] 集成所有子组件
  - [ ] 统一状态管理
  - [ ] 错误处理和加载状态
- [ ] 创建 `src/components/memos/hooks.ts`：
  - [ ] `useMemos` - memo 列表状态管理
  - [ ] `useInfiniteScroll` - 无限滚动逻辑
  - [ ] `useMemoEditor` - 编辑器状态管理

### 阶段 4: 页面层实现 (Pages) - 2天

#### 4.1 页面路由

- [ ] 创建 `src/app/memos/page.tsx` (列表页)：
  - [ ] SSR 优化首屏渲染
  - [ ] SEO metadata 生成
  - [ ] 集成 MemosApp 组件
  - [ ] 响应式设计
- [ ] 创建 `src/app/memos/[slug]/page.tsx` (详情页)：
  - [ ] 单个 memo 详情展示
  - [ ] 支持编辑功能（管理员）
  - [ ] 社交分享功能

#### 4.2 SEO 和性能优化

- [ ] 实现动态 metadata 生成
- [ ] 优化首屏加载性能
- [ ] 添加结构化数据
- [ ] 移动端适配优化

### 阶段 5: 集成测试和优化 (Polish) - 2天

#### 5.1 端到端测试

- [ ] 测试完整的读写流程
- [ ] 验证多源数据同步机制
- [ ] 测试权限控制和安全性
- [ ] 跨浏览器兼容性测试

#### 5.2 性能优化和文档

- [ ] 数据库查询优化
- [ ] 缓存策略优化
- [ ] 更新相关文档和 API 说明
- [ ] 部署配置更新

## 🎯 核心功能清单

### 从 Old 项目迁移的功能

- [x] Markdown 编辑和预览（UniversalEditor 已支持）
- [x] 图片拖拽上传和内联处理（UniversalEditor 已支持）
- [ ] 附件管理（上传、预览、删除）
- [ ] 草稿自动保存
- [ ] 公开/私有状态控制
- [ ] 标签自动提取
- [ ] 无限滚动列表
- [ ] 响应式设计
- [ ] 错误处理和确认对话框

### 新增的集成功能

- [ ] 多源内容支持（local + webdav）
- [ ] 内容来源指示
- [ ] 统一的权限控制
- [ ] 与现有系统的一致性

## 🔧 UniversalEditor 配置

### Memo 专用配置示例

```typescript
<UniversalEditor
  initialContent={memoContent}
  onContentChange={handleContentChange}
  attachmentBasePath="Memos/assets"  // memo 专用附件路径
  contentSource="webdav"             // 发布到 webdav
  articlePath={memoPath}             // memo 文件路径
  placeholder="记录你的想法..."
  title="编写 Memo"
  mode="wysiwyg"                     // 默认模式
/>
```

### UniversalEditor 的现有功能

- ✅ 多模式编辑（wysiwyg、source、preview）
- ✅ 图片上传和内联 base64 处理
- ✅ 路径解析和 API URL 转换
- ✅ 内容源支持（webdav/local）
- ✅ Markdown 渲染和语法高亮
- ✅ 附件管理和路径处理

## 🏆 验收标准

### 数据层验收

- [ ] memos 表与 ContentItem 完全兼容
- [ ] 多源数据正确同步到数据库
- [ ] 内容合并和冲突解决正常
- [ ] 数据库记录包含正确的来源标识

### API 层验收

- [ ] 所有 CRUD 操作正常工作
- [ ] 发布到 webdav 功能稳定
- [ ] 附件上传和管理功能完整
- [ ] 权限控制正确实施

### 前端功能验收

- [ ] UniversalEditor 正确配置 memo 参数
- [ ] 图片上传到 `Memos/assets` 目录
- [ ] 支持多模式编辑
- [ ] 内联 base64 图片自动处理
- [ ] 草稿保存和恢复功能
- [ ] 列表展示和无限滚动
- [ ] 附件预览和下载功能
- [ ] 响应式设计和移动端适配

### 集成功能验收

- [ ] 多源数据一致性
- [ ] 内容同步状态显示
- [ ] SEO 优化和性能良好

## ⚠️ 风险评估和缓解

### 高风险项

1. **WebDAV 写入功能复杂度**
   - 风险：WebDAV 写入操作可能不稳定
   - 缓解：分步实现，先基础后高级

2. **多源数据同步一致性**
   - 风险：local 和 webdav 数据可能出现不一致
   - 缓解：严格的冲突检测和解决机制

### 中风险项

1. **前端组件复杂度**
   - 风险：列表和状态管理实现复杂
   - 缓解：分组件逐步实现，保持功能简化

2. **性能优化**
   - 风险：大量 memo 数据可能影响性能
   - 缓解：分页、缓存和懒加载

### 低风险项

1. **数据库迁移**
   - 风险：现有数据可能受影响
   - 缓解：创建备份，使用可回滚的迁移脚本

## 📊 预估工作量

- **阶段 1**: 2-3天（数据层基础）
- **阶段 2**: 2-3天（API 层）
- **阶段 3**: 2-3天（前端组件，使用 UniversalEditor 简化）
- **阶段 4**: 2天（页面层）
- **阶段 5**: 2天（测试和优化）

**总计: 10-13天**（相比原计划节省 3天）

## 🚀 实施建议

1. **优先实现核心功能**，后续迭代添加高级功能
2. **每个阶段都要有完整的测试验证**
3. **保持与现有系统的兼容性**
4. **文档和代码注释要详细**，便于后续维护
5. **充分利用 UniversalEditor**，避免重复开发

## 📋 Old 项目功能详细分析

### 完整功能架构

#### 1. 数据层 (Data Layer)

**数据库 Schema**: 完整的 memos 表，包含字段：

- `id` (text, primary key) - 文件路径作为唯一标识
- `slug` (text, not null) - URL 友好标识符
- `title` (text) - 从内容第一个 H1 提取或为空
- `body` (text, not null) - markdown 纯文本内容
- `publishDate` (integer, not null) - UNIX timestamp，通常是创建时间
- `updateDate` (integer) - UNIX timestamp
- `public` (boolean, default false) - 公开/私有状态
- `tags` (text) - JSON 字符串存储标签数组
- `attachments` (text) - JSON 字符串存储附件信息
- `contentHash` (text, not null) - 内容哈希，用于检测变更
- `etag` (text) - WebDAV ETag，用于检测文件变更
- `lastModified` (integer, not null) - UNIX timestamp
- `createdAt` (integer, not null) - 缓存创建时间
- `updatedAt` (integer, not null) - 缓存更新时间

**WebDAV 集成**:

- 配置路径: `/Memos`
- 附件路径: `/Memos/assets`
- 支持 ETag 缓存和增量更新

**内容缓存系统**:

- 智能缓存机制，基于 ETag 检测文件变更
- 支持增量更新，避免重复处理
- 定时刷新和手动刷新机制

#### 2. API 层 (API Layer)

**tRPC 路由器**: `old/src/server/routers/memos.ts`

- `getAll` - 获取所有 memos
- `getMemos` - 分页获取 memos（支持无限滚动）
- `create` - 创建新 memo
- `update` - 更新现有 memo
- `delete` - 删除 memo
- `uploadAttachment` - 上传附件

**权限控制**:

- 公开内容：所有用户可见
- 私有内容：仅管理员可见
- 写入操作：仅管理员可执行

#### 3. 前端组件层 (Frontend Components)

**核心组件**:

- **MemosApp.tsx**: 主应用容器，集成 React Query 和 tRPC
- **MemosList.tsx**: 列表展示，无限滚动分页，时间线样式
- **QuickMemoEditor.tsx**: 快速编辑器，支持草稿保存和拖拽上传
- **MilkdownEditor.tsx**: 富文本编辑器，基于 Milkdown 框架
- **AttachmentGrid.tsx**: 附件网格，图片预览和灯箱效果

**核心功能特性**:

- Markdown 编辑和预览
- 图片拖拽上传和内联 base64 处理
- 标签自动提取（#标签 格式）
- 草稿自动保存（本地存储，24小时有效）
- 无限滚动分页
- 响应式设计

## 🔄 当前项目集成点分析

### 多源内容系统优势

- **ContentSourceManager**: 统一管理多个内容源
- **LocalContentSource**: 本地文件系统内容源
- **WebDAVContentSource**: WebDAV 内容源
- **ContentItem 接口**: 已包含 memo 类型支持
- **路径映射**: 已配置 memo 路径（`/memos/` 和 `/Memos/`）

### 需要扩展的功能

#### WebDAVContentSource 写入功能

```typescript
// 需要添加的方法
class WebDAVContentSource {
  async createMemo(content: string, metadata: Record<string, any>): Promise<string>
  async updateMemo(id: string, content: string, metadata: Record<string, any>): Promise<void>
  async deleteMemo(id: string): Promise<void>
  async uploadMemoAttachment(filename: string, content: ArrayBuffer): Promise<string>
}
```

#### API 路由设计

```typescript
// src/server/routers/memos.ts
export const memosRouter = createTRPCRouter({
  getMemos: publicProcedure
    .input(z.object({ page: z.number(), limit: z.number() }))
    .query(async ({ input, ctx }) => {
      // 从数据库获取 memo 列表，支持权限过滤
    }),

  createMemo: adminProcedure
    .input(z.object({ content: z.string(), isPublic: z.boolean() }))
    .mutation(async ({ input }) => {
      // 通过 ContentSourceManager 发布到 webdav
    }),
});
```

#### 组件结构设计

```
src/components/memos/
├── MemosApp.tsx           # 主应用容器
├── MemoEditor.tsx         # 基于 UniversalEditor 的编辑器
├── QuickMemoEditor.tsx    # 快速编辑器
├── MemosList.tsx          # 列表展示
├── MemoCard.tsx           # 单个 memo 卡片
├── AttachmentGrid.tsx     # 附件网格
└── hooks.ts               # 自定义 hooks
```

## 📊 性能优化策略

### 1. 数据库查询优化

- 使用索引优化分页查询
- 实现查询缓存机制
- 支持字段选择性查询

### 2. 前端性能优化

- 无限滚动分页
- 图片懒加载
- 组件级别的 React.memo
- 虚拟滚动（如果数据量大）

### 3. 缓存策略

- tRPC 查询缓存
- 浏览器本地存储缓存
- CDN 静态资源缓存

## 🧪 测试策略

### 1. 单元测试

- API 路由测试
- 组件功能测试
- 工具函数测试

### 2. 集成测试

- 内容源集成测试
- 数据库操作测试
- 文件上传测试

### 3. 端到端测试

- 完整用户流程测试
- 跨浏览器兼容性测试
- 移动端功能测试

---

*文档创建时间: 2025-01-14*
*最后更新: 2025-01-14*
