# 项目迁移到 Bun-Only 运行时

## 概述

本项目已成功迁移为只支持 Bun 运行时，移除了所有 Node.js 相关的依赖和配置。

## 修改内容

### 1. package.json 更新

- **engines**: 从 `"node": "^18.17.1 || ^20.3.0 || >= 21.0.0"` 改为 `"bun": "^1.0.0"`
- **scripts**: 所有脚本都改为使用 `bunx --bun`
  - `dev`: `ADMIN_MODE=true bunx --bun astro dev --host`
  - `start`: `bunx --bun astro dev`
  - `build`: `bunx --bun astro build`
  - `preview`: `bunx --bun astro preview`
  - `astro`: `bunx --bun astro`
  - `check:astro`: `bunx --bun astro check`
- **移除的脚本**: `dev:bun` (现在 `dev` 就是用 Bun)

### 2. Astro 配置更新

- **适配器**: 从 `@astrojs/node` 改为 `astro-bun-adapter`
- **输出模式**: 添加 `output: 'server'`
- **图像服务**: 配置为 `noop` 以避免 sharp 兼容性问题

### 3. 数据库代码简化

- **移除**: 所有 Node.js 兼容性代码和运行时检测
- **保留**: 只使用 `bun:sqlite` 和相关的 Drizzle ORM 配置
- **文件**: `src/lib/db.ts`, `scripts/migrate.ts`, `scripts/get_db_schema.ts`

### 4. GitHub Actions 更新

- **移除**: Node.js 设置步骤
- **统一**: Bun 版本为 1.2.13
- **简化**: 工作流配置

### 5. 文档更新

- **README.md**: 移除 Node.js 要求，只保留 Bun 1.0+ 作为前置条件

## 解决的问题

### 原始问题
- ESM 加载器错误：`Only URLs with a scheme in: file, data, and node are supported by the default ESM loader. Received protocol 'bun:'`

### 解决方案
- 使用 Bun 运行时而不是 Node.js
- 移除所有 Node.js 兼容性代码
- 配置 Bun 适配器

## 使用方式

```bash
# 开发
bun run dev

# 构建
bun run build

# 预览
bun run preview

# 数据库迁移
bun run migrate

# 类型检查
bun run check
```

## 优势

1. **简化**: 移除了复杂的运行时检测逻辑
2. **一致性**: 开发和生产环境都使用 Bun
3. **性能**: Bun 的原生 SQLite 支持和更快的启动时间
4. **维护性**: 减少了依赖和配置复杂度

## 注意事项

- 项目现在只支持 Bun 1.0+
- 图像处理使用 noop 服务（可能需要外部图像优化）
- 确保部署环境安装了 Bun
