# 数据库 Seed 系统

数据库 Seed 系统用于在开发和测试环境中填充示例数据，帮助开发者快速搭建和测试功能。

## 🌱 功能特性

- **环境感知**: 自动检测环境，只在开发/测试环境显示测试数据
- **智能过滤**: 生产环境自动过滤掉所有测试数据
- **完整数据**: 包含文章、项目、闪念、评论、用户等完整测试数据
- **安全标识**: 所有测试数据都有特殊前缀和标签，不会与真实数据冲突
- **数据保护**: 内容缓存器会自动保护测试数据，不会被误删
- **增量更新**: 支持清理现有数据或增量添加

## 🚀 快速开始

### 基本用法

```bash
# 执行完整 seed（推荐）
bun run seed

# 检查是否存在测试数据
bun run seed:check

# 清理所有测试数据
bun run seed:clear

# 重置数据库并填充测试数据
bun run db:reset
```

### 高级用法

```bash
# 只 seed 特定类型的数据
bun run seed --types posts,memos

# 增量添加（不清理现有数据）
bun run seed --no-clear

# 静默模式
bun run seed --quiet

# 在生产环境运行（不推荐）
bun run seed --production
```

## 📊 测试数据内容

### 文章数据 (Posts)
- **欢迎文章**: 介绍博客功能的示例文章
- **技术文章**: 现代 Web 开发技术栈介绍
- **AI 文章**: 人工智能技术现状与未来
- **草稿文章**: 演示草稿功能的测试文章

### 项目数据 (Projects)
- **博客系统**: 个人博客系统项目介绍
- **开发工具**: 开发者工具集项目

### 闪念数据 (Memos)
- **功能想法**: 博客功能改进想法
- **学习笔记**: TypeScript 学习笔记
- **生活记录**: 咖啡时光、读书笔记
- **私人内容**: 测试私人/公开状态切换

### 用户和评论
- **测试用户**: 用于评论的示例用户
- **示例评论**: 针对测试文章的评论和回复

## 🔧 环境配置

### 环境变量

系统通过 `NODE_ENV` 环境变量判断当前环境：

```bash
# 开发环境（显示测试数据）
NODE_ENV=development

# 测试环境（显示测试数据）
NODE_ENV=test

# 生产环境（隐藏测试数据）
NODE_ENV=production
```

### 自动过滤机制

- **开发/测试环境**: 显示所有数据（包括测试数据）
- **生产环境**: 自动过滤掉所有测试数据

过滤基于以下标识：
- **ID 前缀**: `test_` 开头的数据
- **内容标签**: 包含 `#测试数据` 标签的内容

## 📝 添加新的测试数据

### 1. 编辑测试数据生成器

编辑 `src/lib/seed/test-data.ts` 文件：

```typescript
// 添加新的测试文章
function generateTestPosts() {
  const posts = [
    // 现有文章...
    {
      id: `${TEST_DATA_PREFIX}post_new`,
      slug: 'test-new-article',
      type: 'post' as const,
      title: '新测试文章',
      // ... 其他字段
      body: `# 新测试文章内容\n\n${TEST_DATA_TAG}`,
    },
  ];
  return posts;
}
```

### 2. 重要规则

- **必须使用前缀**: 所有测试数据 ID 必须以 `TEST_DATA_PREFIX` 开头
- **必须添加标签**: 内容中必须包含 `TEST_DATA_TAG`
- **时间戳生成**: 使用 `generateTimestamp()` 生成随机时间
- **唯一 ID**: 使用 `generateId()` 生成唯一标识符

### 3. 数据类型

支持的数据类型：
- `posts`: 文章和项目
- `memos`: 闪念
- `comments`: 评论
- `users`: 用户

## 🛠️ 开发指南

### 脚本参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `--clear` / `-c` | 清理所有测试数据 | `bun run seed --clear` |
| `--check` | 检查测试数据存在性 | `bun run seed --check` |
| `--no-clear` | 不清理现有数据 | `bun run seed --no-clear` |
| `--production` | 允许在生产环境运行 | `bun run seed --production` |
| `--quiet` / `-q` | 静默模式 | `bun run seed --quiet` |
| `--types` / `-t` | 指定数据类型 | `bun run seed --types posts,memos` |
| `--help` / `-h` | 显示帮助信息 | `bun run seed --help` |

### 编程接口

```typescript
import { seedDatabase, clearAllTestData, hasTestData } from '~/lib/seed';

// 执行 seed
const result = await seedDatabase({
  clearExisting: true,
  developmentOnly: true,
  dataTypes: ['posts', 'memos'],
  verbose: true,
});

// 检查测试数据
const exists = await hasTestData();

// 清理测试数据
await clearAllTestData();
```

## 🔍 故障排除

### 常见问题

**Q: 生产环境中看到了测试数据**
A: 检查 `NODE_ENV` 环境变量是否正确设置为 `production`

**Q: Seed 执行失败**
A: 确保数据库已正确初始化，运行 `bun run migrate` 后再执行 seed

**Q: 测试数据没有显示**
A: 确认当前环境为 `development` 或 `test`

### 调试信息

```bash
# 查看详细执行日志
bun run seed --verbose

# 检查环境配置
bun test-config.ts
```

## 📋 最佳实践

1. **开发流程**: 新项目启动时先运行 `bun run db:reset`
2. **测试隔离**: 测试数据与真实数据完全隔离，不会相互影响
3. **定期清理**: 开发过程中定期运行 `bun run seed:clear` 清理测试数据
4. **生产部署**: 确保生产环境 `NODE_ENV=production`，系统会自动过滤测试数据

## 🛡️ 内容缓存保护

内容缓存器已经过特殊处理，确保测试数据的安全：

- **自动识别**: 缓存器会自动识别测试数据（以 `test_` 开头的 ID）
- **删除保护**: 在所有缓存刷新操作中都会保护测试数据不被删除
- **WebDAV 独立**: 即使 WebDAV 中没有对应文件，测试数据也会被保留
- **智能过滤**: 只在生产环境过滤测试数据，开发环境正常显示

这意味着你可以放心地运行内容缓存刷新，测试数据不会丢失。

## ✅ 功能验证

系统已通过以下测试：

- ✅ 数据库迁移和 seed 集成
- ✅ 环境检测和数据过滤
- ✅ 测试数据生成和插入
- ✅ 数据清理和重置功能
- ✅ 命令行工具和参数解析

## 🔗 相关文档

- [数据库迁移](../DEVELOPMENT.md#database-operations)
- [环境配置](../README.md#configuration)
- [开发指南](../DEVELOPMENT.md)
