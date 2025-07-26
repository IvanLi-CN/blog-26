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

**环境变量**:

- `BUILD_DATE`: 构建日期（Docker 构建时使用）
- `COMMIT_HASH`: 完整提交哈希（Docker 构建时使用）
- `COMMIT_SHORT_HASH`: 短提交哈希（Docker 构建时使用）
- `REPOSITORY_URL`: 仓库 URL（Docker 构建时使用）

**输出**: `src/generated/version.json`

---

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

**环境变量**:

- `DB_PATH`: 数据库文件路径（默认: `./sqlite.db`）

---

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

# 高级用法
bun run scripts/seed.ts --types posts,memos --no-clear --quiet
```

**参数**:

- `--clear, -c`: 清理所有测试数据
- `--check`: 检查是否存在测试数据
- `--no-clear`: 不清理现有测试数据（增量添加）
- `--production`: 允许在生产环境运行（危险！）
- `--quiet, -q`: 静默模式
- `--types, -t`: 指定数据类型（posts,memos,comments,users）

---

### 🛠️ 调试和维护工具

#### `db-tools.ts`

**用途**: 数据库检查和调试工具  
**功能**:

- 检查数据库结构和数据完整性
- 统计文章、评论、用户数据
- 发现数据问题（空标题、空内容等）
- 显示数据库概览和详细信息

**使用方法**:

```bash
# 显示数据库概览
bun run scripts/db-tools.ts

# 显示数据库结构
bun run scripts/db-tools.ts schema

# 显示文章详细信息
bun run scripts/db-tools.ts posts

# 显示评论详细信息
bun run scripts/db-tools.ts comments

# 显示所有信息
bun run scripts/db-tools.ts all
```

**环境变量**:

- `DB_PATH`: 数据库文件路径（默认: `./sqlite.db`）

---

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
bun run scripts/webdav-tools.ts

# 列出指定目录
bun run scripts/webdav-tools.ts list Project

# 列出目录（详细信息）
bun run scripts/webdav-tools.ts list Project --details

# 获取文件内容
bun run scripts/webdav-tools.ts get "Project/文件.md"

# 获取文件内容和元数据
bun run scripts/webdav-tools.ts get "Project/文件.md" --metadata

# 搜索文件
bun run scripts/webdav-tools.ts search "ATX" Project

# 区分大小写搜索
bun run scripts/webdav-tools.ts search "ATX" Project --case-sensitive

# 检查连接
bun run scripts/webdav-tools.ts check
```

**环境变量**:

- `WEBDAV_URL`: WebDAV 服务器地址
- `WEBDAV_USERNAME`: WebDAV 用户名
- `WEBDAV_PASSWORD`: WebDAV 密码

---

## 🚀 部署和运维脚本

### Shell 脚本

#### `deploy.sh`

**用途**: 完整的生产部署脚本  
**功能**:

- 检查环境变量配置
- 构建应用程序
- 使用 Docker Compose 部署
- 健康检查和错误处理

**使用方法**:

```bash
./deploy.sh
```

**前置条件**:

- 配置好的 `.env` 文件
- Docker 和 Docker Compose
- 必需的环境变量

---

#### `debug-health.sh`

**用途**: 详细的健康检查和调试工具  
**功能**:

- 检查容器状态和端口监听
- 检查应用进程
- 测试内部和外部连接
- 分析容器日志

**使用方法**:

```bash
./debug-health.sh
```

---

#### `troubleshoot.sh`

**用途**: 系统故障排除工具  
**功能**:

- 检查系统环境
- 验证环境变量
- 检查容器状态
- 分析错误日志

**使用方法**:

```bash
./troubleshoot.sh
```

---

#### `entrypoint.sh`

**用途**: Docker 容器启动脚本  
**功能**:

- 验证配置
- 运行数据库迁移
- 启动应用程序

**使用**: 在 Docker 容器中自动执行

---

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

### 维护指南

- 定期检查脚本的有效性
- 更新文档以反映功能变更
- 删除不再使用的临时脚本
- 合并功能相似的脚本以减少维护负担

---

## 📞 获取帮助

每个脚本都支持 `--help` 参数来显示详细的使用说明：

```bash
bun run scripts/[脚本名].ts --help
```

如果遇到问题，请检查：

1. 环境变量是否正确配置
2. 依赖是否已安装
3. 权限是否足够
4. 网络连接是否正常
