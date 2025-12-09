# E2E 测试完整指南

本目录包含项目的端到端 (E2E) 测试用例，使用 Playwright 测试框架覆盖关键功能和用户交互场景。
E2E 场景通过项目级 `extraHTTPHeaders` 模拟 SSO（`Remote-Email`/`SSO_EMAIL_HEADER_NAME`），并由
header 路由 helper 仅对应用 origin (`BASE_URL`) 保留该头、对 Iconify/Simplesvg/Unisvg 等第三方显式剥离，避免
CORS；生产或手工调试请继续使用 /api/dev/login 或 /dev 页面。

## 📁 测试文件结构

已按“游客 / 普通用户 / 管理员”三组划分。Header 模拟仅在 E2E 测试中生效，相关 fixtures 已处理 origin 级剥离；手工验证请使用 dev 登录入口或真实 SSO。

```
e2e/
├── guest/
│   ├── code-block-rendering.spec.ts   # 代码块渲染（公开内容）
│   ├── dev-auth.spec.ts               # 开发环境认证接口
│   └── rss.spec.ts                    # RSS 输出与缓存
├── user/
│   ├── memos-user.spec.ts             # 普通用户在 Memos 的权限
│   └── session-header-auth.spec.ts    # Header 注入的用户认证
├── admin/
│   ├── memos-admin.spec.ts            # 管理员在 Memos 的权限
│   └── post-editor-slug.spec.ts       # 管理后台文章编辑器（slug/id）
└── README.md
```

## 🧪 测试分类和覆盖范围

### 1. 认证和权限测试

#### `session-complete.spec.ts` - Session 认证系统

- ✅ 用户登录流程
- ✅ Session 状态管理
- ✅ 权限验证机制
- ✅ 登出功能

#### `dev-auth.spec.ts` - 开发环境认证

- ✅ 开发环境权限绕过
- ✅ 测试环境管理员访问
- ✅ 开发模式特殊处理

#### `memos-permissions.spec.ts` - 闪念权限控制

- ✅ 闪念访问权限
- ✅ 管理员权限验证
- ✅ 未授权访问处理

### 2. 内容渲染和交互测试

#### `code-block-rendering.spec.ts` - 代码块渲染

- ✅ 代码高亮显示
- ✅ 语法高亮准确性
- ✅ 代码块样式渲染
- ✅ 响应式适配

#### `memos-lightbox.spec.ts` - 闪念图片灯箱

- ✅ 图片点击放大
- ✅ 灯箱导航功能
- ✅ 键盘快捷键支持
- ✅ 触摸手势支持
- ✅ 关闭功能

### 3. 数据同步管理测试

#### `admin-data-sync.spec.ts` - 基础功能

- ✅ 页面加载和渲染
- ✅ 同步操作触发
- ✅ 进度显示和更新
- ✅ 同步日志功能
- ✅ 错误处理和用户反馈

#### `admin-data-sync-auth.spec.ts` - 权限验证

- ✅ 管理员权限验证
- ✅ 未授权访问重定向
- ✅ 管理员导航菜单
- ✅ 安全性检查

#### `admin-data-sync-edge-cases.spec.ts` - 边界情况

- ✅ 并发同步操作防护
- ✅ 网络中断和恢复
- ✅ API 响应超时处理
- ✅ 大量日志数据处理
- ✅ 空数据状态处理

### 4. 集成测试

#### `incremental-sync-integration.spec.ts` - 增量同步集成

- ✅ 增量同步流程
- ✅ 数据一致性验证
- ✅ 同步状态管理
- ✅ 错误恢复机制

## 🚀 运行测试

### 环境准备（必需）

在运行 E2E 测试之前，必须先准备测试环境：

```bash
# 准备完整的测试环境（推荐）
bun run test-env:reset
```

### 运行所有测试

```bash
# 运行所有 E2E 测试
bun run test:e2e

# 无头模式运行（CI 环境）
bun run test:e2e:headless

# 显示浏览器界面运行
bun run test:e2e:headed

# 调试模式运行
bun run test:e2e:debug

# 使用 Playwright UI 运行
bun run test:e2e:ui
```

### 运行特定测试类别（按身份组）

```bash
# 游客组（不带登录会话）
npx playwright test --project=guest-chromium

# 普通用户组（注入非管理员邮箱）
npx playwright test --project=user-chromium

# 管理员组（注入 ADMIN_EMAIL）
npx playwright test --project=admin-chromium
```

### 调试和开发

```bash
# 调试特定测试文件
npx playwright test tests/e2e/session-complete.spec.ts --debug

# 显示浏览器界面运行特定测试
npx playwright test tests/e2e/memos-lightbox.spec.ts --headed

# 过滤特定测试用例
npx playwright test --grep "登录流程"

# 生成 HTML 报告
npx playwright test --reporter=html

# 查看测试报告
bun run test:e2e:report
```

## 🔧 测试配置

### 环境变量

测试运行时会自动设置以下环境变量：

- `NODE_ENV=test` - 测试环境标识
- `ADMIN_EMAIL=admin-test@test.local` - 测试环境管理员邮箱
- `USER_EMAIL=user@test.local` - 测试环境普通用户邮箱（可选）
- `DB_PATH=./test-data/sqlite.db` - 测试数据库路径

### 测试数据

- 测试环境会自动生成测试数据
- 每次测试运行前会清理和重新生成数据
- 测试数据包括本地文件和 WebDAV 内容
- 使用 `bun run test-env:reset` 重置完整测试环境

### 运行时配置

- 默认使用 Chromium 浏览器
- 视口大小：1280x720
- 支持移动端和平板端测试
- 自动启动一体化测试服务（Next.js 应用）：端口 25090
- 自动启动 WebDAV 测试服务器（dufs）：端口 25091
- 实时通道采用 tRPC + HTTP SSE（不使用 WebSocket）

## 📊 测试标识符

为了提高测试的稳定性，项目中使用了以下测试标识符：

### 数据同步管理页面

```typescript
// 主要控制区域
[data-testid="sync-controls"]

// 按钮
[data-testid="full-sync-button"]
[data-testid="incremental-sync-button"]
[data-testid="cancel-sync-button"]

// 同步进度
[data-testid="sync-progress-section"]
[data-testid="sync-progress-bar"]
[data-testid="sync-progress-details"]

// 状态消息
[data-testid="sync-success-message"]
[data-testid="sync-error-message"]

// 日志功能
[data-testid="sync-logs-section"]
[data-testid="sync-logs-title"]
[data-testid="sync-logs-count"]
[data-testid="toggle-logs-button"]
[data-testid="sync-logs-content"]
[data-testid="empty-logs-state"]
```

### 闪念相关页面

```typescript
// 闪念列表
[data-testid="memos-list"]
[data-testid="memo-item"]

// 图片灯箱
[data-testid="lightbox-overlay"]
[data-testid="lightbox-image"]
[data-testid="lightbox-close"]
[data-testid="lightbox-nav-prev"]
[data-testid="lightbox-nav-next"]
```

### 认证相关

```typescript
// 登录表单
[data-testid="login-form"]
[data-testid="email-input"]
[data-testid="login-button"]

// 权限提示
[data-testid="unauthorized-message"]
[data-testid="admin-nav"]
```

## 🐛 调试测试

### 查看测试报告

```bash
# 生成并打开 HTML 报告
bun run test:e2e:report

# 或使用 Playwright 命令
npx playwright show-report
```

### 调试失败的测试

```bash
# 调试模式运行特定测试
npx playwright test tests/e2e/session-complete.spec.ts --debug

# 查看测试录像和截图
npx playwright show-trace test-results/[test-name]/trace.zip

# 显示浏览器界面运行
npx playwright test tests/e2e/memos-lightbox.spec.ts --headed
```

### 常见问题和解决方案

#### 1. 测试超时

**问题**：测试运行时出现超时错误

**解决方案**：

```bash
# 检查测试服务器是否正常启动
bun run test-server:start

# 检查数据库状态
bun run test-db:check

# 重置测试环境
bun run test-env:reset
```

#### 2. 元素未找到

**问题**：测试中找不到页面元素

**解决方案**：

- 验证测试标识符是否正确
- 检查页面是否完全加载
- 使用调试模式查看页面状态：`npx playwright test --debug`

#### 3. 权限问题

**问题**：测试中出现权限验证失败

**解决方案**：

- 确保环境变量正确设置：`ADMIN_EMAIL=admin-test@test.local`
- 检查测试环境的权限验证逻辑
- 验证 Session 认证状态

#### 4. 数据库相关错误

**问题**：测试中出现数据库连接或数据问题

**解决方案**：

```bash
# 检查测试数据库
bun run test-db:posts

# 重置测试数据库
bun run test-db:reset

# 验证测试数据
bun run test-data:verify
```

## 📈 测试最佳实践

### 1. 元素定位策略

- **优先使用** `data-testid` 属性定位元素
- **避免使用** CSS 类名或复杂选择器
- **使用语义化** 的测试标识符名称

### 2. 等待策略

```typescript
// ✅ 推荐：使用 Playwright 的智能等待
await page.waitForSelector('[data-testid="sync-progress-bar"]');

// ❌ 避免：硬编码延时
await page.waitForTimeout(5000);
```

### 3. 断言和验证

- 每个测试用例都有明确的断言
- 验证关键的用户交互结果
- 包含错误场景的测试

### 4. 测试隔离

- 每个测试都应该独立运行
- 使用 `test.beforeEach` 进行环境准备
- 避免测试之间的数据依赖

## 🔄 持续集成

项目已配置 GitHub Actions 自动运行 E2E 测试：

```yaml
# .github/workflows/e2e.yml
- name: Prepare Test Environment
  run: bun run test-env:reset

- name: Run E2E Tests
  run: bun run test:e2e
```

### 本地 CI 模拟

```bash
# 模拟 CI 环境运行测试
CI=true bun run test:e2e:headless
```

## 📝 贡献指南

### 添加新测试

1. **选择合适的测试文件**或创建新的测试文件
2. **使用描述性的测试名称**，清楚说明测试目的
3. **添加适当的测试标识符**到相关组件
4. **包含正常和异常场景**的测试用例
5. **更新本文档**的测试覆盖范围说明

### 测试文件命名规范

- 功能测试：`[feature-name].spec.ts`
- 页面测试：`[page-name].spec.ts`
- 集成测试：`[feature-name]-integration.spec.ts`

### 代码质量要求

- 使用 TypeScript 类型注解
- 遵循项目的代码风格
- 添加必要的注释说明
- 确保测试的稳定性和可重复性
