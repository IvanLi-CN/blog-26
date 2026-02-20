# 0005 对齐长驻开发服务（devctl）+ WebDAV 端口可控

## 背景 / 问题陈述

目前仓库内对“长驻开发服务（dev server / watch）如何保持运行”的说明主要以 `nohup + pid` 为主；
但 Codex 的最新推荐方案是使用 `~/.codex/bin/devctl` 将服务运行在 Zellij 后台 session 中，以确保
跨 turn 持久运行、便于查看日志与停止服务。

另外，`bun run dev` 会并行启动 `bun run webdav:dev` 与 `next dev`。如果 WebDAV 端口不能被固定，
则会导致 `WEBDAV_URL` 与实际监听端口不一致，进而出现内容源未注册/注册到错误端口等问题，
尤其在 worktree/并行开发环境下更容易踩坑。

## 目标 / 非目标

### 目标

- 将文档（README/AGENTS）对齐到最新方案：长驻服务优先用 `devctl`（Zellij 后台 session），`nohup` 仅作为 fallback。
- 让 `bun run webdav:dev` 支持通过 `WEBDAV_URL` 或 `WEBDAV_PORT` 固定端口：
  - 当指定时严格使用该端口；端口不可用则直接失败并给出明确提示（不再悄悄换端口）。
  - 未指定时维持现有行为：从默认端口开始尝试可用端口。
- 对齐 `scripts/setup.sh` 的默认端口校验到 `PORT=25090`、`WEBDAV_PORT=25091`。
- 确保 `.codex/` 不会进入 `git status`（通过 `.gitignore` 显式忽略）。

### 非目标

- 不改造 `devctl` 本身（位于 `$CODEX_HOME`）。
- 不做大规模启动架构重写，仅做最小必要改动。

## 范围（In / Out）

### In scope

- README/AGENTS：长驻服务使用 `devctl` 的示例与说明；保留 `nohup` fallback。
- `scripts/start-dev-webdav.ts`：增加 `WEBDAV_URL/WEBDAV_PORT` 解析与 strict 行为。
- `scripts/setup.sh`：默认 WebDAV 端口从 `26091` 对齐到 `25091`。
- `.gitignore`：忽略 `.codex/`。

### Out of scope

- CI / 部署改造
- WebDAV 生产环境配置变更

## 验收标准（Acceptance Criteria）

1) README 与 AGENTS 明确：Codex/Agent 的长驻服务使用 `~/.codex/bin/devctl`（`up/down/logs/status/down-all`），
   `nohup + pid` 仅作为 fallback。
2) `bun run webdav:dev`：
   - 设置 `WEBDAV_URL=http://localhost:<port>` 时，WebDAV 必须绑定到 `<port>`；
   - 设置 `WEBDAV_PORT=<port>`（或 `DAV_PORT=<port>`）时，WebDAV 必须绑定到 `<port>`；
   - 若端口占用，脚本直接失败并提示如何换端口/停止占用进程（不自动换端口）。
3) 未设置 `WEBDAV_URL/WEBDAV_PORT/DAV_PORT` 时，行为与现在一致：默认从 `25091` 起探测可用端口。
4) `scripts/setup.sh` 默认校验端口为 `PORT=25090`、`WEBDAV_PORT=25091`，与默认 dev 行为一致。
5) `.codex/` 被 `.gitignore` 忽略，不会出现在 `git status` 的 untracked/changes 中。

## 测试策略

- `bun run check`
- `bun test`
- 新增单元测试覆盖 WebDAV dev 配置解析（`WEBDAV_URL` / `WEBDAV_PORT` / 默认与错误输入）。

## 里程碑（Milestones）

- [x] 文档对齐到 devctl 优先（保留 nohup fallback）
- [x] WebDAV dev 支持 strict 端口固定（WEBDAV_URL/WEBDAV_PORT）
- [x] setup 默认端口对齐 + `.gitignore` 忽略 `.codex/`
- [x] 验证（check + test）通过

## 风险与开放问题

- 若有人希望 `WEBDAV_URL` 指向非本地 WebDAV，本次改动将明确报错；该场景应改用 `bun run dev:next`
  并自行提供远端 `WEBDAV_URL`（不启动 `webdav:dev`）。
