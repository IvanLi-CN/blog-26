# 向量化失败原因追踪功能

## 概述
为向量化系统添加了失败原因记录功能，并在文章管理列表中显示失败原因的提示信息。

## 主要更改

### 1. 数据库 Schema 更新
- **文件**: `src/lib/schema.ts`
- **更改**: 在 `vectorizedFiles` 表中添加了 `errorMessage` 字段
- **类型**: `text('error_message')` - 可选字段，用于存储向量化失败的原因

### 2. 数据库操作增强
- **文件**: `src/lib/db.ts`
- **新增函数**: `recordVectorizationError(filepath, slug, errorMessage)`
  - 记录向量化失败的原因
  - 如果记录已存在，更新错误信息并清除向量数据
  - 如果记录不存在，创建新记录只包含错误信息
- **更新函数**: `upsertFileRecord()` - 支持 `errorMessage` 字段

### 3. 向量化逻辑更新
- **文件**: `src/lib/vectorizer.ts`
- **更改**:
  - 成功向量化时，将 `errorMessage` 设置为 `null`
  - 向量化失败时，调用 `recordVectorizationError()` 记录失败原因
  - 支持两个向量化函数：`processAndVectorizeAllContent` 和 `processAndVectorizeBatchContent`

### 4. API 响应格式更新
- **文件**: `src/server/routers/vectorization.ts`
- **更改**: 
  - 状态响应从简单字符串改为对象格式：`{ status: string, errorMessage?: string }`
  - 支持返回向量化失败的具体原因

### 5. 前端显示增强

#### 文章管理页面
- **文件**: `src/pages/admin/posts.astro`
- **更改**: 
  - 支持新的状态格式
  - 在未索引状态的 tooltip 中显示失败原因（如果存在）

#### 文章列表组件
- **文件**: `src/components/blog/ListItem.astro`
- **更改**:
  - 添加了向量化失败图标（警告图标）
  - 支持在 tooltip 中显示失败原因
  - 更新状态缓存逻辑以支持错误信息

## 功能特性

### 1. 错误记录
- 自动记录向量化过程中的所有错误
- 错误信息包括具体的失败原因（如 API 限制、网络错误等）
- 支持错误信息的更新和清除

### 2. 状态显示
- **已索引**: 绿色 AI 图标，表示向量化成功
- **需更新**: 黄色 AI 图标，表示模型版本不匹配
- **未索引**: 无图标（正常情况）
- **向量化失败**: 红色警告图标，hover 显示具体错误原因

### 3. 用户体验
- 鼠标悬停在状态图标上可查看详细信息
- 失败原因以易读的格式显示
- 不影响现有的向量化和搜索功能

## 数据库迁移
已执行数据库迁移，添加了 `error_message` 列到 `vectorized_files` 表。

## 测试验证
- ✅ 数据库错误记录功能
- ✅ 向量化失败时的错误记录
- ✅ API 响应格式兼容性
- ✅ 前端状态显示

## 使用方法
1. 向量化失败时，错误信息会自动记录到数据库
2. 在文章管理页面，未索引的文章如果有失败原因，会在 tooltip 中显示
3. 在文章列表页面，失败的向量化会显示红色警告图标
4. 重新向量化成功后，错误信息会自动清除
