# E2E 测试指南

本文档详细说明如何在本地和CI环境中运行E2E测试。

## 🎯 测试概述

项目使用 **Playwright** 进行端到端测试，覆盖以下核心功能：

### 📋 测试覆盖范围

1. **Session认证测试** (`session-complete.spec.ts`)
   - 基本登录和认证流程
   - 登出功能验证
   - 多设备登录基础测试

2. **Code Block渲染测试** (`code-block-rendering.spec.ts`)
   - JavaScript代码块正确显示
   - 语法高亮功能验证
   - 代码格式和缩进保持
   - Hydration错误检测
   - 页面布局完整性

## 🚀 本地运行E2E测试

### 📋 前置条件

1. **安装依赖**
   ```bash
   bun install
   ```

2. **安装Playwright浏览器**
   ```bash
   bunx playwright install
   ```

### 🔧 测试环境准备

E2E测试需要完整的测试环境，包括数据库和测试内容。

#### 🔍 环境验证（推荐第一步）

```bash
# 验证E2E测试环境是否正确配置
bun run test:e2e:verify
```

这个命令会检查：
- 数据库连接和测试数据
- 测试数据文件完整性
- 测试脚本文件存在性
- Playwright环境配置

#### 方法1：一键重置测试环境（推荐）

```bash
# 完整重置测试环境
bun run test-env:reset
```

这个命令会：
- 清理所有测试数据（文章、用户、文件）
- 重新生成测试内容文件
- 从内容源同步数据到数据库
- 插入基础种子数据

#### 方法2：手动步骤

```bash
# 1. 清理现有测试环境
bun run test-env:clean

# 2. 初始化数据库
bun run migrate

# 3. 插入基础种子数据
bun run seed

# 4. 生成测试内容文件
bun run test-data:generate

# 5. 同步内容到数据库
bun run test-sync:trigger
```

### ▶️ 运行测试

#### 运行所有E2E测试

```bash
# 标准模式（有界面）
bun run test:e2e

# 或者使用Playwright直接运行
bunx playwright test
```

#### 运行特定测试文件

```bash
# 只运行Session认证测试
bunx playwright test tests/e2e/session-complete.spec.ts

# 只运行Code Block渲染测试
bunx playwright test tests/e2e/code-block-rendering.spec.ts
```

#### 调试模式

```bash
# 以调试模式运行（会打开浏览器）
bunx playwright test --debug

# 运行特定测试并调试
bunx playwright test tests/e2e/session-complete.spec.ts --debug
```

### 📊 查看测试报告

```bash
# 查看最新的HTML测试报告
bunx playwright show-report
```

## 🔧 测试配置

### 📁 测试文件结构

```
tests/
├── e2e/
│   ├── session-complete.spec.ts    # Session认证测试
│   └── code-block-rendering.spec.ts # Code Block渲染测试
└── playwright.config.ts            # Playwright配置
```

### ⚙️ Playwright配置要点

- **浏览器**: Chromium (默认)
- **超时时间**: 60秒
- **并发**: 1个worker（避免数据冲突）
- **服务器**: 自动启动一体化测试服务（应用 + WebDAV）
- **端口**: 应用 `25090`，WebDAV `25091`

## 🛠️ 数据管理

### 📝 测试数据清理

```bash
# 预览要清理的测试文章
bun run test-posts:preview

# 清理测试文章数据
bun run test-posts:clean

# 完整清理测试环境
bun run test-env:clean
```

### 🔄 测试数据重置

```bash
# 重置整个测试环境
bun run test-env:reset

# 只重新生成内容文件
bun run test-data:generate

# 只同步内容到数据库
bun run test-sync:trigger
```

## 🐛 常见问题

### ❌ 测试失败：找不到文章

**问题**: Code Block测试失败，提示找不到文章

**解决方案**:
```bash
# 重新设置测试环境
bun run test-env:reset

# 验证数据是否正确同步
bun run db:posts
```

### ❌ 端口冲突

**问题**: 测试启动失败，端口被占用（默认应用端口 25090，WebDAV 端口 25091）

**解决方案**:
```bash
# 查找并释放应用端口
lsof -ti:25090 | xargs -r kill -9

# 查找并释放 WebDAV 端口
lsof -ti:25091 | xargs -r kill -9

# 重新运行测试
bun run test:e2e
```

### ❌ WebDAV错误

**问题**: 测试中出现WebDAV 404错误

**说明**: 这些错误是正常的，因为某些文件不存在。只要测试通过就没问题。

### ❌ Hydration错误

**问题**: 出现hydration不匹配错误

**解决方案**: 检查服务器端和客户端HTML是否一致，特别是主题相关的属性。

## 🎯 CI/CD集成

### GitHub Actions

项目已配置GitHub Actions自动运行E2E测试：

1. **安装依赖**: Bun、Playwright、dufs
2. **准备环境**: 初始化数据库、生成测试数据
3. **启动服务**: WebDAV服务器、Next.js应用
4. **运行测试**: 所有E2E测试
5. **生成报告**: 测试结果和HTML报告

### 本地CI模拟

```bash
# 模拟完整的CI流程
bun run test:ci
```

这个命令会模拟GitHub Actions的完整流程，帮助在本地验证CI配置。

## 📚 最佳实践

1. **测试前重置环境**: 确保测试环境干净
2. **使用固定数据**: 避免依赖随机或动态数据
3. **独立测试**: 每个测试应该独立运行
4. **清理资源**: 测试后清理临时数据
5. **监控性能**: 关注测试执行时间

## 🔗 相关命令速查

| 命令 | 功能 | 说明 |
|------|------|------|
| `bun run test:e2e` | 运行E2E测试 | 标准测试运行 |
| `bun run test-env:reset` | 重置测试环境 | 一键完整重置 |
| `bun run test-posts:preview` | 预览测试数据 | 查看要清理的内容 |
| `bun run test:ci` | CI流程模拟 | 本地验证CI配置 |
| `bunx playwright test --debug` | 调试模式 | 交互式调试 |
| `bunx playwright show-report` | 查看报告 | HTML测试报告 |
