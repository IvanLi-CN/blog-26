# 数据同步管理页面 E2E 测试

本目录包含数据同步管理页面 (`/admin/data-sync`) 的端到端测试用例，使用 Playwright 测试框架。

## 📁 测试文件结构

```
e2e/
├── admin-data-sync.spec.ts           # 主要功能测试
├── admin-data-sync-auth.spec.ts      # 权限验证测试
├── admin-data-sync-edge-cases.spec.ts # 边界情况和错误处理测试
└── README.md                         # 本文档
```

## 🧪 测试覆盖范围

### 1. 基础功能测试 (`admin-data-sync.spec.ts`)
- ✅ 页面加载和渲染
- ✅ 页面标题和描述显示
- ✅ 控制按钮显示和状态
- ✅ 数据同步操作触发
- ✅ 同步进度显示和更新
- ✅ 同步日志功能
- ✅ 日志展开/折叠
- ✅ 错误处理和用户反馈
- ✅ 响应式设计适配
- ✅ 可访问性支持

### 2. 权限验证测试 (`admin-data-sync-auth.spec.ts`)
- ✅ 管理员权限验证
- ✅ 未授权访问重定向
- ✅ 测试环境权限绕过机制
- ✅ 管理员导航菜单
- ✅ 页面间导航
- ✅ 安全性检查
- ✅ 错误处理

### 3. 边界情况测试 (`admin-data-sync-edge-cases.spec.ts`)
- ✅ 并发同步操作防护
- ✅ 快速页面切换处理
- ✅ 网络中断和恢复
- ✅ API 响应超时处理
- ✅ 大量日志数据处理
- ✅ 空数据状态处理
- ✅ JavaScript 错误处理
- ✅ 长时间运行稳定性
- ✅ 内存使用监控
- ✅ 多种视口尺寸适配
- ✅ 触摸设备交互

## 🚀 运行测试

### 使用测试运行脚本（推荐）

```bash
# 运行所有数据同步相关测试
bun run scripts/run-data-sync-tests.ts

# 运行基础功能测试
bun run scripts/run-data-sync-tests.ts basic

# 运行权限验证测试
bun run scripts/run-data-sync-tests.ts auth

# 运行边界情况测试
bun run scripts/run-data-sync-tests.ts edge

# 调试模式运行
bun run scripts/run-data-sync-tests.ts basic --debug

# 无头模式运行
bun run scripts/run-data-sync-tests.ts --headless

# 过滤特定测试
bun run scripts/run-data-sync-tests.ts --grep "同步操作"
```

### 直接使用 Playwright

```bash
# 运行所有数据同步测试
npx playwright test e2e/admin-data-sync*.spec.ts

# 运行特定测试文件
npx playwright test e2e/admin-data-sync.spec.ts

# 调试模式
npx playwright test e2e/admin-data-sync.spec.ts --debug

# 显示浏览器界面
npx playwright test e2e/admin-data-sync.spec.ts --headed

# 生成 HTML 报告
npx playwright test e2e/admin-data-sync*.spec.ts --reporter=html
```

## 🔧 测试配置

### 环境变量
测试运行时会自动设置以下环境变量：
- `NODE_ENV=test` - 测试环境标识
- `ADMIN_EMAIL=admin-test@test.local` - 测试环境管理员邮箱

### 测试数据
- 测试环境会自动生成测试数据
- 每次测试运行前会清理和重新生成数据
- 测试数据包括本地文件和 WebDAV 内容

### 浏览器配置
- 默认使用 Chromium 浏览器
- 视口大小：1280x720
- 支持移动端和平板端测试

## 📊 测试标识符

为了提高测试的稳定性，组件中添加了以下测试标识符：

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

## 🐛 调试测试

### 查看测试报告
```bash
# 生成并打开 HTML 报告
npx playwright show-report
```

### 调试失败的测试
```bash
# 调试模式运行特定测试
npx playwright test e2e/admin-data-sync.spec.ts --debug

# 查看测试录像
npx playwright show-trace test-results/[test-name]/trace.zip
```

### 常见问题

1. **测试超时**
   - 检查测试服务器是否正常启动
   - 增加等待时间或超时设置
   - 检查网络连接

2. **元素未找到**
   - 验证测试标识符是否正确
   - 检查页面是否完全加载
   - 使用调试模式查看页面状态

3. **权限问题**
   - 确保 `ADMIN_MODE=true` 环境变量设置
   - 检查权限验证逻辑

## 📈 测试最佳实践

1. **使用测试标识符**：优先使用 `data-testid` 属性定位元素
2. **等待策略**：使用适当的等待条件，避免硬编码延时
3. **断言清晰**：每个测试用例都有明确的断言和验证
4. **错误处理**：测试包含错误场景和边界情况
5. **可维护性**：测试代码结构清晰，易于维护和扩展

## 🔄 持续集成

测试可以集成到 CI/CD 流程中：

```yaml
# GitHub Actions 示例
- name: Run E2E Tests
  run: |
    bun run scripts/run-data-sync-tests.ts --headless
```

## 📝 贡献指南

添加新测试时请遵循以下规范：
1. 使用描述性的测试名称
2. 添加适当的测试标识符
3. 包含错误处理和边界情况
4. 更新本文档的测试覆盖范围
5. 确保测试的稳定性和可重复性
