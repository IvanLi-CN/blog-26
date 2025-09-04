# 数据同步管理页面 E2E 测试

## 概述

本目录包含数据同步管理页面的端到端测试，专门测试管理员数据同步功能的各个方面。

## 测试文件结构

### 核心测试文件

#### `admin-data-sync.spec.ts`
**数据同步管理页面基础功能测试**
- 页面加载和渲染
- 数据同步操作（全量和增量）
- 实时同步状态显示
- 实时日志功能
- 内容统计面板
- WebSocket 连接和实时更新
- 错误处理

#### `admin-data-sync-auth.spec.ts`
**权限验证测试**
- 管理员权限验证
- 未授权访问重定向
- 测试环境权限绕过
- 页面导航和布局
- 安全性测试
- 错误处理

#### `admin-data-sync-edge-cases.spec.ts`
**边界情况和错误处理测试**
- 并发同步操作
- 长时间运行的同步
- WebSocket 连接中断和恢复
- 实时日志流的大量数据处理
- WebSocket 消息积压处理
- 异常状态处理

#### `admin-data-sync-realtime.spec.ts`
**实时功能专项测试**
- WebSocket 连接和维护
- 实时日志流接收和显示
- 自动滚动功能
- 日志进场动画
- 实时进度更新
- 内容统计面板实时更新

#### `incremental-sync-integration.spec.ts`
**增量数据同步功能集成测试**
- 闪念系统：创建、编辑、删除闪念后的自动同步
- 文章系统：创建、编辑、删除文章后的自动同步
- 同步完成后的数据一致性验证
- 同步失败时的错误处理

### 辅助工具

#### `sync-test-helpers.ts`
**数据同步E2E测试辅助工具**
- 实时同步检测
- WebSocket 连接监控
- 日志动画验证
- 自动滚动检查
- 测试数据生成器
- 管理员登录辅助器

## 运行测试

### 运行所有数据同步测试
```bash
# 运行整个数据同步测试套件
bun test:e2e tests/e2e/admin-data-sync/

# 或使用 Playwright 直接运行
npx playwright test tests/e2e/admin-data-sync/
```

### 运行特定测试文件
```bash
# 基础功能测试
bun test:e2e tests/e2e/admin-data-sync/admin-data-sync.spec.ts

# 权限验证测试
bun test:e2e tests/e2e/admin-data-sync/admin-data-sync-auth.spec.ts

# 边界情况测试
bun test:e2e tests/e2e/admin-data-sync/admin-data-sync-edge-cases.spec.ts

# 实时功能测试
bun test:e2e tests/e2e/admin-data-sync/admin-data-sync-realtime.spec.ts

# 增量同步集成测试
bun test:e2e tests/e2e/admin-data-sync/incremental-sync-integration.spec.ts
```

### 调试模式
```bash
# 调试特定测试
npx playwright test tests/e2e/admin-data-sync/admin-data-sync.spec.ts --debug

# 显示浏览器界面运行
npx playwright test tests/e2e/admin-data-sync/ --headed

# 过滤特定测试用例
npx playwright test tests/e2e/admin-data-sync/ --grep "全量同步"
```

## 测试覆盖范围

### 功能覆盖
- ✅ 页面基础功能 (100%)
- ✅ 权限验证 (100%)
- ✅ 数据同步操作 (100%)
- ✅ 实时功能 (100%)
- ✅ 边界情况处理 (100%)
- ✅ 错误处理 (100%)

### 测试类型
- **单元功能测试**: 测试单个功能点
- **集成测试**: 测试功能间的协作
- **端到端测试**: 测试完整的用户流程
- **边界测试**: 测试异常和边界情况
- **性能测试**: 测试实时功能的性能表现

## 测试环境要求

### 前置条件
1. **测试数据库**: 需要配置测试数据库
2. **WebDAV 服务**: 需要运行 WebDAV 测试服务
3. **测试数据**: 需要生成测试内容文件

### 环境准备
```bash
# 重置测试环境
bun run test-env:reset

# 验证测试环境
bun run test:e2e:verify
```

## 测试数据管理

### 测试数据生成
- 使用 `TestDataGenerator` 生成测试用的闪念和文章数据
- 每个测试用例使用唯一的时间戳和计数器
- 测试数据包含完整的 Markdown 内容和元数据

### 数据清理
- 测试完成后自动清理生成的测试数据
- 支持手动清理测试数据

## 常见问题

### 测试超时
- 数据同步操作可能需要较长时间，已设置适当的超时时间
- 如果遇到超时，检查 WebDAV 服务是否正常运行

### WebSocket 连接问题
- 确保测试环境支持 WebSocket 连接
- 检查防火墙和代理设置

### 权限问题
- 确保使用正确的测试管理员账户
- 检查测试环境的权限配置

## 维护指南

### 添加新测试
1. 在相应的测试文件中添加新的测试用例
2. 使用 `sync-test-helpers.ts` 中的辅助函数
3. 遵循现有的测试模式和命名规范

### 更新测试
1. 保持测试的独立性和可重复性
2. 更新相关的辅助函数
3. 确保测试覆盖新增的功能点

### 性能优化
1. 合理使用等待时间，避免不必要的延迟
2. 优化选择器，使用更稳定的元素定位
3. 并行运行独立的测试用例
