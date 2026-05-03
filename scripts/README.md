# 📜 脚本文档

本目录包含了项目的各种工具脚本，用于开发、调试、部署和维护。

## 📋 脚本概览

### 🔧 核心功能脚本

#### `generate-version.ts`
**用途**: 生成版本信息文件  
**功能**:
- 生成格式为 `YYYYMMDD-shortHash` 的版本号
- 支持 Docker 构建和本地构建环境
- 从 Git 获取提交信息和仓库 URL
- 检测未提交的更改并添加 `-draft` 后缀

**使用方法**:
```bash
bun run scripts/generate-version.ts
```

#### `migrate.ts`
**用途**: 数据库迁移脚本  
**功能**:
- 运行 Drizzle ORM 数据库迁移
- 支持 Bun SQLite 驱动

**使用方法**:
```bash
bun run migrate
# 或
bun run scripts/migrate.ts
```

#### `seed.ts`
**用途**: 数据库种子数据填充  
**功能**:
- 填充开发和测试环境的示例数据
- 支持选择性数据类型填充
- 支持清理现有测试数据
- 包含安全检查，防止在生产环境误操作

**使用方法**:
```bash
# 执行完整 seed
bun run seed

# 清理测试数据
bun run seed:clear

# 检查测试数据
bun run seed:check
```

### 🛠️ 调试和维护工具

#### `db-tools.ts`
**用途**: 数据库检查和调试工具  
**功能**:
- 检查数据库结构和数据完整性
- 统计文章、评论、用户数据
- 发现数据问题（空标题、空内容等）
- 显示数据库概览和详细信息

#### `webdav-tools.ts`
**用途**: WebDAV 文件管理和调试工具
**功能**:
- 列出 WebDAV 目录内容
- 获取文件内容和元数据
- 搜索文件名
- 检查 WebDAV 连接状态

**使用方法**:

```bash
# 列出根目录
bun run webdav:list

# 检查连接
bun run webdav:check

# 获取文件内容
bun run scripts/webdav-tools.ts get "path/to/file.md"

# 搜索文件
bun run scripts/webdav-tools.ts search "keyword"
```

### 🌐 WebDAV 服务器脚本

#### `start-dev-webdav.ts`

**用途**: 开发环境 WebDAV 服务器
**功能**:

- 使用 dufs 提供完整的 WebDAV 支持
- 自动端口检测和分配
- 支持文件上传、下载、删除
- 启用 CORS 支持

**使用方法**:

```bash
bun run webdav:dev
```

#### `start-test-webdav-dufs.ts`

**用途**: 测试环境 WebDAV 服务器
**功能**:

- 专为测试环境设计的 WebDAV 服务器
- 与开发环境数据隔离
- 支持 E2E 测试

**使用方法**:

```bash
bun run webdav:test
```

### 🧪 测试脚本

#### `generate-test-data.ts`
**用途**: 生成测试数据
**功能**:

- 生成闪念文件和博客文章
- 支持开发环境和测试环境
- 创建完整的目录结构
- 支持数据清理

**使用方法**:

```bash
# 生成测试数据
bun run test-data:generate

# 生成开发数据
bun run dev-data:generate

# 清理测试数据
bun run test-data:clean

# 清理开发数据
bun run dev-data:clean
```

#### `verify-test-data.ts`

**用途**: 验证测试数据
**功能**:

- 检查测试数据格式和完整性
- 验证 frontmatter 字段
- 统计文件数量
- 发现数据问题

**使用方法**:

```bash
bun run test-data:verify
```

#### `run-e2e-tests.ts`
**用途**: 运行端到端测试
**功能**:
- 启动测试服务器
- 运行 Playwright E2E 测试
- 生成测试报告

## 🚀 部署和运维脚本

### Shell 脚本

#### `deploy.sh`
**用途**: 完整的生产部署脚本

#### `debug-health.sh`
**用途**: 详细的健康检查和调试工具

#### `troubleshoot.sh`
**用途**: 系统故障排除工具

## 📦 Package.json 脚本

项目在 `package.json` 中定义了以下便捷脚本：

```json
{
  "scripts": {
    "migrate": "bun ./scripts/migrate.ts",
    "seed": "bun ./scripts/seed.ts",
    "seed:clear": "bun ./scripts/seed.ts --clear",
    "seed:check": "bun ./scripts/seed.ts --check",
    "db:reset": "bun run migrate && bun run seed"
  }
}
```

## 🔧 开发建议

### 添加新脚本时的最佳实践

1. **文件命名**: 使用 kebab-case，如 `my-tool.ts`
2. **Shebang**: TypeScript 脚本添加 `#!/usr/bin/env bun`
3. **帮助信息**: 实现 `--help` 参数
4. **错误处理**: 使用适当的退出码
5. **环境变量**: 支持配置和默认值
6. **日志格式**: 使用表情符号和一致的格式

### 脚本分类

- **核心功能**: 构建、迁移、种子数据等必需脚本
- **调试工具**: 数据检查、连接测试等开发辅助脚本
- **部署运维**: 部署、健康检查、故障排除等运维脚本

---

### 🧪 Memos 迁移测试脚本

#### `test-memos-data.ts`

**用途**: 测试 Memos 数据库数据完整性
**功能**:

- 验证数据库连接和表结构
- 检查数据完整性和内容预览
- 分析标签分布和空内容统计
- 验证数据库字段映射修复

**使用方法**:

```bash
bun run scripts/test-memos-data.ts
```

#### `test-api-endpoints.ts`

**用途**: 测试 TRPC API 端点功能
**功能**:

- 验证 memos.list API 响应
- 检查数据格式和字段映射
- 验证内容不是简单的 "content"
- 测试分页和数据完整性

**使用方法**:

```bash
# 确保开发服务器运行
bun run dev

# 在另一个终端运行测试
bun run scripts/test-api-endpoints.ts
```

## 📞 获取帮助

每个脚本都支持 `--help` 参数来显示详细的使用说明：

```bash
bun run scripts/[脚本名].ts --help
```
