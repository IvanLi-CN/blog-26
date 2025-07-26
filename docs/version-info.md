# 版本信息功能

## 概述

项目现在包含了一个自动版本信息系统，在管理页面首页显示当前构建的版本信息。

## 版本号格式

版本号格式为：`YYYYMMDD-shortHash[-draft]`

- `YYYYMMDD`: 构建日期，例如 `20250726`
- `shortHash`: Git commit 的短哈希值，例如 `4878b05`
- `-draft`: 可选后缀，当存在未提交的更改时自动添加

完整示例：
- 干净的代码库：`20250726-4878b05`
- 有未提交更改：`20250726-4878b05-draft`

## 功能特性

### 1. 自动生成版本信息

- 在构建时自动生成版本信息
- 包含构建日期、commit hash、仓库 URL 等信息
- 版本信息存储在 `src/generated/version.json` 文件中

### 2. 管理页面显示

- 在管理页面首页显示版本信息
- 版本号可点击，链接到对应的 commit 页面
- 鼠标悬停显示构建日期

### 3. 构建集成

- 通过 `prebuild` 脚本自动在构建前生成版本信息
- 支持 Docker 构建环境，通过环境变量传递 Git 信息
- 在开发环境中显示 fallback 版本信息
- GitHub Actions 自动传递构建参数到 Docker

### 4. 未提交更改检测

- 自动检测是否存在未提交的 Git 更改
- 如果有未提交的更改，版本号会自动添加 `-draft` 后缀
- 链接地址保持不变，仍然指向当前 commit
- 帮助区分开发版本和正式发布版本

## 文件结构

```
scripts/
  generate-version.ts     # 版本信息生成脚本
src/
  lib/
    version.ts           # 版本信息工具模块
    version.test.ts      # 版本信息测试
  generated/
    version.json         # 生成的版本信息文件（不提交到 git）
  pages/
    admin/
      index.astro        # 管理页面（显示版本信息）
```

## 使用方法

### 手动生成版本信息

```bash
bun scripts/generate-version.ts
```

### 构建时自动生成

```bash
bun run build  # 会自动运行 prebuild 脚本生成版本信息
```

### Docker 构建

在 Docker 构建时，版本信息通过构建参数传递：

```bash
docker build \
  --build-arg BUILD_DATE=20250726 \
  --build-arg COMMIT_HASH=abc123def456 \
  --build-arg COMMIT_SHORT_HASH=abc123 \
  --build-arg REPOSITORY_URL=https://git.ivanli.cc/Ivan/blog-astrowind \
  .
```

GitHub Actions 会自动设置这些参数。

### 在代码中使用

```typescript
import { getVersionInfo, formatVersionInfo } from '~/lib/version';

// 获取版本信息
const versionInfo = getVersionInfo();

// 格式化版本信息用于显示
const formatted = formatVersionInfo(versionInfo);
```

## 配置

### Git 仓库 URL 转换

脚本支持自动转换不同格式的 Git 仓库 URL：

- SSH 格式：`ssh://gitea@git.ivanli.cc:7018/Ivan/blog-astrowind.git`
- 转换为：`https://git.ivanli.cc/Ivan/blog-astrowind`

### Fallback 处理

如果无法获取 Git 信息（例如在开发环境中），会使用 fallback 值：

- 版本号：`YYYYMMDD-dev`
- Commit hash：`development`
- 仓库 URL：默认仓库地址

## 测试

运行版本信息相关测试：

```bash
bun test src/lib/version.test.ts
```

## 注意事项

1. `src/generated/` 目录已添加到 `.gitignore`，不会提交到版本控制
2. 版本信息在每次构建时重新生成
3. 在管理页面中，版本号链接到对应的 commit 页面
4. 支持在 Docker 环境中正确生成版本信息
