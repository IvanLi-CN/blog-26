# 鉴权逻辑单元测试

本目录包含了项目鉴权逻辑的全面单元测试，确保认证和授权功能的正确性和可靠性。

## 测试结构

```
tests/
├── setup.ts                    # 测试环境设置
├── lib/
│   ├── auth-utils.test.ts      # 核心认证工具测试
│   ├── auth.test.ts            # Astro 页面认证测试
│   └── jwt.test.ts             # JWT 工具测试
├── server/
│   ├── context.test.ts         # tRPC 上下文测试
│   └── trpc.test.ts            # tRPC 中间件测试
├── integration/
│   └── auth-flow.test.ts       # 认证流程集成测试
└── README.md                   # 本文档
```

## 测试覆盖范围

### 🔐 核心认证逻辑 (`auth-utils.test.ts`)
- ✅ JWT token 提取和验证
- ✅ Remote-Email 请求头认证
- ✅ 开发模式 (ADMIN_MODE) 认证
- ✅ 管理员邮箱匹配检查
- ✅ 复杂 cookie 字符串解析
- ✅ 错误处理和边界情况
- ✅ 响应辅助函数 (401/403)

### 🌐 Astro 页面认证 (`auth.test.ts`)
- ✅ Cookie 中的用户信息提取
- ✅ 管理员邮箱验证
- ✅ 请求头中的管理员检查
- ✅ Cookie 中的管理员检查
- ✅ 统一认证逻辑集成
- ✅ 配置错误处理
- ✅ 重定向响应生成

### 🔑 JWT 工具 (`jwt.test.ts`)
- ✅ JWT token 签名
- ✅ JWT token 验证
- ✅ 无效 token 处理
- ✅ 错误密钥检测
- ✅ 空 token 处理
- ✅ 载荷字段保持
- ✅ Token 生命周期管理

### 🚀 tRPC 上下文 (`context.test.ts`)
- ✅ 空请求上下文创建
- ✅ JWT 用户上下文创建
- ✅ 管理员请求头上下文
- ✅ 客户端 IP 地址提取
- ✅ 开发模式处理
- ✅ 用户和管理员状态组合

### 🛡️ tRPC 中间件 (`trpc.test.ts`)
- ✅ 管理员中间件逻辑
- ✅ 认证中间件逻辑
- ✅ 错误类型验证
- ✅ 权限检查边界情况

### 🔄 集成测试 (`auth-flow.test.ts`)
- ✅ 完整认证流程
- ✅ 多种认证方式组合
- ✅ 错误处理流程
- ✅ 边界情况处理

## 运行测试

```bash
# 运行所有测试
bun test

# 监视模式运行测试
bun test:watch

# 运行特定测试文件
bun test tests/lib/auth-utils.test.ts

# 运行特定测试用例
bun test --grep "should identify admin from JWT user email"
```

## 测试统计

- **总测试数量**: 80 个
- **测试文件数量**: 6 个
- **断言数量**: 144 个
- **测试通过率**: 100%
- **平均执行时间**: ~60ms

## 测试环境

测试使用以下环境配置：

```typescript
process.env.NODE_ENV = 'test';
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only-32-chars';
process.env.DB_PATH = ':memory:';
```

## 关键测试场景

### 1. 管理员认证场景
- JWT token 中的管理员邮箱
- Remote-Email 请求头认证
- 开发模式自动管理员权限
- 错误邮箱拒绝访问

### 2. 普通用户认证场景
- 有效 JWT token 认证
- 无效 token 处理
- 未认证用户处理

### 3. 错误处理场景
- 配置缺失处理
- 恶意 token 处理
- 网络错误处理
- 环境变量缺失处理

### 4. 边界情况
- 空请求处理
- 复杂 cookie 字符串
- 多重认证方式组合
- 权限状态变更

## 维护指南

### 添加新测试
1. 在相应的测试文件中添加新的测试用例
2. 确保测试覆盖正常流程和错误情况
3. 使用描述性的测试名称
4. 添加必要的环境变量设置和清理

### 修改现有测试
1. 更新测试时确保不破坏现有功能
2. 保持测试的独立性和可重复性
3. 更新相关文档

### 测试最佳实践
1. 每个测试应该独立运行
2. 使用 beforeEach/afterEach 进行环境设置和清理
3. 测试名称应该清楚描述测试内容
4. 使用适当的断言和错误消息
5. 避免测试之间的依赖关系

## 持续集成

这些测试应该在以下情况下运行：
- 每次代码提交前
- Pull Request 创建时
- 部署到生产环境前
- 定期的回归测试

确保所有测试通过后才能合并代码或部署到生产环境。
