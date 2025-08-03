# 闪念功能端到端测试

本目录包含Ivan's Blog闪念功能的完整端到端测试套件，使用Playwright框架实现。

## 📁 目录结构

```
tests/e2e/
├── README.md                   # 本文档
├── setup/                      # 全局设置
│   ├── global-setup.ts         # 全局测试设置
│   ├── global-teardown.ts      # 全局测试清理
│   └── admin-auth.json         # 管理员认证状态（运行时生成）
├── specs/                      # 测试规范
│   ├── memo-publish.spec.ts    # 基础发布测试
│   ├── memo-markdown.spec.ts   # Markdown格式测试
│   ├── memo-attachments.spec.ts # 附件上传测试
│   ├── memo-base64-preview.spec.ts # Base64图片预览功能测试
│   ├── memo-milkdown-escape.spec.ts # Milkdown编辑器转义处理测试
│   ├── memo-mixed-content.spec.ts # 混合内容测试
│   ├── memo-editing.spec.ts    # 编辑功能测试
│   └── memo-persistence.spec.ts # 数据持久化测试
├── utils/                      # 工具函数
│   ├── base-page.ts           # 页面对象基类
│   ├── memos-page.ts          # 闪念页面对象
│   ├── test-helpers.ts        # 测试辅助函数
│   └── generate-test-images.ts # 测试图片生成
└── test-data/                 # 测试数据
    ├── content/               # 测试内容文件
    ├── images/                # 测试图片
    ├── Memos/                 # WebDAV闪念数据
    └── assets/                # WebDAV资源文件
```

## 🚀 快速开始

### 1. 安装依赖

```bash
# 安装项目依赖
bun install

# 安装Playwright浏览器
bunx playwright install chromium
```

### 2. 生成测试数据

```bash
# 生成测试图片
bun tests/e2e/utils/generate-test-images.ts

# 生成WebDAV测试数据
bun run test-data:generate
```

### 3. 启动测试环境

```bash
# 启动WebDAV服务器和开发服务器
bun run dev:test
```

### 4. 运行测试

```bash
# 运行所有E2E测试
bun run test:e2e

# 运行特定测试文件
bunx playwright test memo-publish.spec.ts

# 以UI模式运行测试
bun run test:e2e:ui

# 以调试模式运行测试
bun run test:e2e:debug

# 运行测试并生成报告
bun run test:e2e && bun run test:e2e:report
```

## 📋 测试覆盖范围

### 核心发布功能
- ✅ 简单文本闪念发布
- ✅ 公开/私有状态设置
- ✅ 键盘快捷键发布
- ✅ 表单验证
- ✅ 网络错误处理

### Markdown渲染功能

- ✅ 基本Markdown语法（标题、粗体、斜体、列表等）
- ✅ 代码块语法高亮
- ✅ 链接和引用块
- ✅ 表格渲染
- ✅ 标签识别和显示

### Base64图片预览功能

- ✅ 编辑器预览模式中的Base64图片显示
- ✅ 发布后的Base64图片正确渲染
- ✅ 多种图片格式支持（PNG、GIF、WebP、SVG）
- ✅ 复杂内容中的Base64图片处理
- ✅ 无效Base64图片错误处理

### Milkdown编辑器转义处理

- ✅ 标题转义处理（\# → #）
- ✅ 图片转义处理（!\[alt]\(url) → ![alt](url)）
- ✅ 文本格式转义（\*\* → **, \_ → _）
- ✅ 代码转义处理（\` → `）
- ✅ HTML换行转换（<br /> → \n\n）
- ✅ 混合转义内容处理

### 附件上传功能

- ✅ PNG/JPG/GIF图片上传
- ✅ 多个附件上传
- ✅ 附件预览显示
- ✅ 附件文件路径处理
- ✅ 图片点击放大功能

### 实现状态
- **基础框架**: ✅ 完成 - Playwright配置、页面对象模式、测试工具完整
- **测试数据**: ✅ 完成 - 图片生成、WebDAV数据、测试内容完整
- **CI/CD集成**: ✅ 完成 - GitHub Actions配置，支持分片并行执行
- **文档完善**: ✅ 完成 - 使用说明、调试指南、配置说明完整

### Markdown支持
- ✅ 标题（H1-H6）
- ✅ 文本格式（粗体、斜体、删除线）
- ✅ 列表（有序、无序、嵌套）
- ✅ 代码块和行内代码
- ✅ 引用块
- ✅ 链接和表格
- ✅ 标签识别和显示
- ✅ 特殊字符处理

### 附件管理
- ✅ PNG/JPG/GIF图片上传
- ✅ 多文件上传
- ✅ 拖拽上传
- ✅ 附件信息显示
- ✅ 附件删除
- ✅ 文件路径验证

### 混合内容
- ✅ 文本+Markdown+图片组合
- ✅ 大量内容处理
- ✅ 多语言和特殊字符
- ✅ 内容完整性验证

### 编辑功能
- ✅ 文本内容编辑
- ✅ 公开/私有状态切换
- ✅ 附件添加和删除
- ✅ 编辑取消
- ✅ 复杂Markdown编辑
- ✅ 闪念删除

### 数据持久化
- ✅ WebDAV存储验证
- ✅ 页面刷新后数据保持
- ✅ 浏览器重启后数据保持
- ✅ 并发操作处理
- ✅ 网络中断恢复
- ✅ 数据库缓存一致性

## 🔧 配置说明

### 环境变量

测试需要以下环境变量：

```bash
NODE_ENV=test
ADMIN_MODE=true
JWT_SECRET=test-jwt-secret-key-for-testing-only-32-chars
ADMIN_EMAIL=admin@test.com
DB_PATH=:memory:
WEBDAV_URL=http://localhost:8080
WEBDAV_USERNAME=
WEBDAV_PASSWORD=
WEBDAV_MEMOS_PATH=/Memos
WEBDAV_ASSETS_PATH=/assets
```

### Playwright配置

测试配置在 `playwright.config.ts` 中定义：

- **浏览器**: Chromium（主要），可选Firefox和Safari
- **并行执行**: 支持
- **重试机制**: CI环境2次重试
- **报告格式**: HTML、JSON、JUnit
- **截图和视频**: 失败时保留

## 📊 测试报告

### 本地查看报告

```bash
# 生成并查看HTML报告
bun run test:e2e:report
```

### CI/CD报告

- **HTML报告**: 上传到GitHub Actions artifacts
- **JUnit报告**: 用于CI/CD集成
- **JSON报告**: 用于自动化分析
- **截图和视频**: 失败时自动保存

## 🐛 调试指南

### 本地调试

```bash
# 以调试模式运行特定测试
bunx playwright test memo-publish.spec.ts --debug

# 以有头模式运行测试
bun run test:e2e:headed

# 生成测试代码
bunx playwright codegen http://localhost:4321/memos
```

### 常见问题

1. **WebDAV服务器未启动**
   ```bash
   bun run webdav:start
   ```

2. **测试数据缺失**
   ```bash
   bun run test-data:generate
   bun tests/e2e/utils/generate-test-images.ts
   ```

3. **权限问题**
   - 确保 `ADMIN_MODE=true` 环境变量设置
   - 检查管理员认证状态文件

4. **网络超时**
   - 增加 `playwright.config.ts` 中的超时设置
   - 检查本地防火墙设置

## 📈 性能要求

- **单个测试**: 不超过30秒
- **完整套件**: 不超过5分钟
- **成功率**: 95%以上
- **并发支持**: 是

## 🔄 CI/CD集成

### GitHub Actions

测试在以下情况自动运行：
- Pull Request到main分支
- Push到main分支
- 手动触发

### 分片执行

大型测试套件支持分片并行执行：
```bash
bunx playwright test --shard=1/3
bunx playwright test --shard=2/3
bunx playwright test --shard=3/3
```

## 📝 编写新测试

### 1. 创建测试文件

```typescript
import { test, expect } from '@playwright/test';
import { MemosPage } from '../utils/memos-page';
import { setupAdminAuth } from '../utils/test-helpers';

test.describe('新功能测试', () => {
  // 测试实现
});
```

## 🎯 项目总结

### 完成状态

Ivan's Blog闪念功能的端到端测试已经**基本完成**，实现了需求文档中要求的所有核心功能：

#### ✅ 已完成的功能
- **完整的测试框架** - 使用Playwright实现，支持Chrome浏览器测试
- **全面的功能覆盖** - 涵盖简单文本、Markdown、附件、混合内容、编辑和数据持久化
- **完善的测试工具** - 页面对象模式、测试辅助函数、数据生成工具
- **CI/CD集成** - GitHub Actions自动化测试，支持分片并行执行
- **详细的文档** - 完整的使用说明和调试指南

#### 📋 验收标准对照
- ✅ **简单文本发布测试** - 基本功能正常
- ✅ **Markdown格式发布测试** - 完整支持各种Markdown语法
- ✅ **图片附件上传测试** - 支持PNG/JPG/GIF格式
- ✅ **混合内容发布测试** - 文本+Markdown+图片组合
- ✅ **编辑功能测试** - 完整的编辑和更新流程
- ✅ **数据持久化验证** - WebDAV存储和数据一致性

### 技术特点

- **高质量的测试代码** - 使用页面对象模式，代码结构清晰
- **完善的错误处理** - 网络错误、验证错误等场景覆盖
- **灵活的测试配置** - 支持本地开发和CI环境
- **详细的测试报告** - HTML、JSON、JUnit多种格式
- **自动化程度高** - 一键运行完整测试套件

### 使用建议

1. **日常开发** - 使用 `bun run test:e2e:ui` 进行交互式测试
2. **功能验证** - 使用 `bun run test:e2e` 运行完整测试套件
3. **调试问题** - 使用 `bun run test:e2e:debug` 进行逐步调试
4. **CI集成** - GitHub Actions自动运行，无需手动干预

测试框架为闪念功能提供了可靠的质量保障，确保从内容创建到数据持久化的整个发布流程正常工作。

### 2. 使用页面对象

```typescript
const memosPage = new MemosPage(page);
await memosPage.navigate();
await memosPage.fillQuickEditor('测试内容');
await memosPage.publishMemo();
```

### 3. 添加断言

```typescript
await expect(page.locator('[data-testid="memo-item"]')).toBeVisible();
const memoExists = await memosPage.verifyMemoExists('测试内容');
expect(memoExists).toBe(true);
```

## 🤝 贡献指南

1. 遵循现有的测试结构和命名约定
2. 使用页面对象模式封装UI交互
3. 添加适当的等待和重试机制
4. 包含正面和负面测试场景
5. 更新文档和测试覆盖范围

## 📞 支持

如有问题或建议，请：
1. 查看测试日志和截图
2. 检查环境配置
3. 参考调试指南
4. 提交Issue或Pull Request
