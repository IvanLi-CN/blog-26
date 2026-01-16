# 文件格式（File formats）

## Markdown 资源引用（persisted links）

- 范围（Scope）: internal
- 变更（Change）: Modify
- 编码（Encoding）: utf-8

### Schema（结构）

本计划定义“持久化不变量”：

- **持久化内容（Markdown 落盘）不得包含**以 `/api/files/` 开头的链接。
- 图片/附件在 Markdown 内引用时，必须是**相对路径**（Relative Path），并在保存时输出为**规范化相对路径**（Normalized Relative Path）。

支持的相对路径输入（保存时会规范化）：

- `./assets/<filename>`
- `../<dir>/<filename>`
- `<filename>`（同目录）
- `assets/<filename>`（同目录下的子目录）

规范化输出约定（已按 `PLAN.md` 的决策冻结；仍需补齐“占位图文案”等少量运行时口径）：

- 对“上传产生的新资源”：一律写回 `./assets/<filename>`
- 对“同目录文件引用”：`<filename>` 输出 `./<filename>`
- 对 `assets/<filename>`：输出 `./assets/<filename>`（不改变到 `./<filename>`）
- 对输入中包含多余空白、反斜杠或连续斜杠：保存时清理为标准 POSIX 形式
- 对非法路径：拒绝保存（例如包含 `..` 越界后的结果、`~`、或尝试逃逸内容根目录）

> 说明：运行时渲染允许把相对路径解析并映射成 `/api/files/<source>/<resolvedPath>`；但该映射不得写回 Markdown 文件。

### Examples（示例）

假设 markdown 文件路径为 `blog/hello-world.md`：

- 输入：`![alt](./assets/a.png)`
  - 持久化：`![alt](./assets/a.png)`
  - 运行时读取：`/api/files/local/blog/assets/a.png`

- 输入：`![alt](assets/a.png)`
  - 持久化：`![alt](./assets/a.png)`
  - 运行时读取：`/api/files/local/blog/assets/a.png`

- 输入：`![alt](/api/files/webdav/blog/assets/a.png)`
  - 持久化：`![alt](./assets/a.png)`
  - 运行时读取：`/api/files/local/blog/assets/a.png`（source 由运行时配置决定）

- 输入：`![alt](/assets/shared/logo.png)`（站点绝对路径，按 content-root-relative 解释）
  - 持久化：`![alt](../assets/shared/logo.png)`（允许跨目录引用）
  - 运行时读取：`/api/files/local/assets/shared/logo.png`

### 兼容性与迁移（Compatibility / migration）

- 迁移前：允许历史内容中存在 `/api/files/<source>/...`；系统必须提供迁移机制将其改写为规范化相对路径。
- 迁移中：禁止产生新的 `/api/files/` 落盘引用（写入端与服务端守门人同时生效）。
- 迁移后：扫描/校验必须证明内容目录中不含 `/api/files/` 字符串。
