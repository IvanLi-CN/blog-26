# Polyrepo 迁移计划

本计划旨在将当前 Monorepo 项目转换为只包含 `apps/web` 的 Polyrepo 项目，并移除 Turbo 以及其他不再需要的应用和包。

## 计划步骤

1.  **清理不再需要的目录：**
    *   删除 `apps/llamaindex-demo` 目录及其所有内容。
    *   删除 `apps/server` 目录及其所有内容。
    *   删除 `packages` 目录及其所有内容。

2.  **移动 `apps/web` 内容：**
    *   将 `apps/web` 目录下的所有文件和文件夹移动到仓库的根目录。
    *   删除空的 `apps` 目录。

3.  **更新根目录 `package.json`：**
    *   删除 `turbo` 相关的依赖 (`devDependencies` 中的 `turbo`)。
    *   删除 `workspaces` 字段。
    *   更新 `scripts` 字段，移除 `turbo run` 前缀，直接使用 `apps/web/package.json` 中的脚本命令。

4.  **处理其他根目录配置文件：**
    *   检查根目录下的 `.gitignore` 文件，移除与 `apps/llamaindex-demo`、`apps/server` 和 `packages` 相关的忽略规则。
    *   检查根目录下的 `biome.jsonc` 文件，确认其配置是否仍然适用于新的项目结构，并进行必要的调整。
    *   检查根目录下的 `lefthook.yml` 文件，由于它是示例配置且与 monorepo 无关，可以考虑删除或根据需要进行修改。
    *   检查其他根目录下的配置文件（如 `.gitmodules`, `.npmrc`, `bun.lock`, `package-lock.json` 等），移除与被删除目录相关的配置。

5.  **更新 `apps/web` 内部配置：**
    *   检查 `apps/web` 目录下的配置文件（如 `.gitignore`, `lefthook.yml` 等），确保它们在移动到根目录后仍然有效，并进行必要的路径调整。

6.  **运行安装和检查命令：**
    *   在新的根目录下运行包管理器安装命令（例如 `bun install`），以更新依赖。
    *   运行项目的检查和构建命令，确保一切正常。

## 计划图示

```mermaid
graph TD
    A[开始] --> B(清理不再需要的目录);
    B --> C(移动 apps/web 内容到根目录);
    C --> D(更新根目录 package.json);
    D --> E(处理其他根目录配置文件);
    E --> F(更新 apps/web 内部配置);
    F --> G(运行安装和检查命令);
    G --> H(完成);