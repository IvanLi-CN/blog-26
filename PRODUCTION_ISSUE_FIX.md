# 生产环境问题修复报告

## 问题概述

根据生产环境日志分析，发现两个主要问题：

1. **Playwright 浏览器缺失**：WebDAV 内容加载失败
2. **LaTeX 渲染警告**：KaTeX 处理数学公式时出现 Unicode 字符警告

## 问题详细分析

### 1. Playwright 浏览器缺失

**错误信息：**
```
Failed to load content from WebDAV: warn: launch: Executable doesn't exist at /root/.cache/ms-playwright/chromium_headless_shell-1179/chrome-linux/headless_shell
```

**根本原因：**
- `rehype-mermaid` 插件需要 Playwright 来在服务端渲染 Mermaid 图表为 SVG
- Docker 镜像构建时没有安装 Playwright 浏览器
- CI/CD 流程中有安装 Playwright，但 Docker 镜像中缺失

**影响：**
- WebDAV 内容加载失败
- Mermaid 图表无法正常渲染
- 应用功能受限

### 2. LaTeX 渲染警告

**错误信息：**
```
LaTeX-incompatible input and strict mode is set to 'warn': Unrecognized Unicode character "Ω" (937) [unknownSymbol]
LaTeX-incompatible input and strict mode is set to 'warn': Unicode text character "，" used in math mode [unicodeTextInMathMode]
```

**根本原因：**
- KaTeX 默认启用严格模式
- 数学公式中包含不兼容的 Unicode 字符（如中文逗号、希腊字母等）
- 严格模式下会产生大量警告信息

## 解决方案

### 1. 修复 Playwright 浏览器缺失

**修改文件：** `Dockerfile`

**修改内容：**
```dockerfile
# 修改前
RUN bun install --frozen --no-cache && \
  apt-get update && \
  apt-get install -y curl && \
  rm -rf /var/lib/apt/lists/*

# 修改后
RUN bun install --frozen --no-cache && \
  bunx playwright install --with-deps && \
  apt-get update && \
  apt-get install -y curl && \
  rm -rf /var/lib/apt/lists/*
```

**说明：**
- 在 Docker 镜像构建时安装 Playwright 浏览器
- 使用 `--with-deps` 参数安装所有必要的系统依赖
- 确保 `rehype-mermaid` 能正常工作

### 2. 优化 KaTeX 配置

**修改文件：** `astro.config.ts` 和 `src/utils/markdown.ts`

**astro.config.ts 修改：**
```typescript
// 修改前
rehypeKatex,

// 修改后
[
  rehypeKatex,
  {
    strict: false, // 禁用严格模式以减少警告
    throwOnError: false, // 遇到错误时不抛出异常
  },
],
```

**src/utils/markdown.ts 修改：**
```typescript
// 修改前
.use(rehypeKatex)

// 修改后
.use(rehypeKatex, {
  strict: false, // 禁用严格模式以减少警告
  throwOnError: false, // 遇到错误时不抛出异常
})
```

**说明：**
- 禁用 KaTeX 严格模式，允许 Unicode 字符
- 设置 `throwOnError: false` 确保渲染错误不会中断应用
- 减少日志中的警告信息

## 预期效果

### 修复后的改进

1. **WebDAV 功能恢复：**
   - WebDAV 内容能正常加载
   - Mermaid 图表能正确渲染
   - 博客文章和项目内容正常显示

2. **日志清理：**
   - 大幅减少 LaTeX 相关警告信息
   - 日志更加清晰，便于问题排查
   - 提升应用启动和运行的稳定性

3. **性能提升：**
   - 减少错误重试次数
   - 降低日志输出量
   - 提升整体应用性能

## 部署建议

1. **重新构建 Docker 镜像：**
   ```bash
   docker-compose build --no-cache
   ```

2. **重新部署应用：**
   ```bash
   docker-compose down
   docker-compose up -d
   ```

3. **验证修复效果：**
   - 检查 WebDAV 内容是否正常加载
   - 验证 Mermaid 图表是否正确显示
   - 观察日志是否减少警告信息

## 注意事项

1. **镜像大小增加：**
   - 安装 Playwright 浏览器会增加 Docker 镜像大小
   - 这是必要的权衡，确保功能正常

2. **构建时间延长：**
   - 首次构建时间会增加（下载浏览器）
   - 后续构建可以利用 Docker 缓存

3. **监控建议：**
   - 部署后持续监控应用日志
   - 确认 WebDAV 功能正常工作
   - 验证数学公式渲染效果

## 相关文档

- [Playwright 安装文档](https://playwright.dev/docs/intro)
- [rehype-mermaid 配置](https://github.com/remcohaszing/rehype-mermaid)
- [KaTeX 配置选项](https://katex.org/docs/options.html)
- [项目 Mermaid 使用指南](./docs/mermaid-usage.md)
