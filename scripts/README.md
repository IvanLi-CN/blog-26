# Scripts

Key project scripts live in this directory. Use Bun unless a shell script is explicitly listed.

## Core

- `worktree-bootstrap.sh`: explicit worktree-local bootstrap entrypoint used by setup and post-checkout hooks
- `post-checkout-worktree-bootstrap.sh`: non-blocking post-checkout wrapper for first-run linked worktree bootstrap
- `port-registry.py`: repository-owned port lease helper used by bootstrap and smoke tests
- `resolve-worktree-port.ts`: derive runtime `web/site/admin` ports from `.env.local`, including legacy `PORT`-only env files
- `generate-version.ts`: generate build version metadata
- `migrate.ts`: run Drizzle migrations
- `seed.ts`: seed or clear SQLite data
- `start-console.ts`: start the self-contained Astro SSR console runtime
- `start-gateway.ts`: start the legacy Bun gateway runtime used by the development stack
- `generate-test-data.ts`: create dev/test local content fixtures
- `trigger-sync.ts`: run content sync against the configured local content root
- `verify-test-data.ts`: validate generated fixture shape
- `package-public-media.ts`: package processed facade media referenced by the generated public site
- `verify-public-media-package.ts`: verify packaged media references and EdgeOne artifact quotas
- `verify-edgeone-pwa-artifact.ts`: verify the staged EdgeOne cache configuration matches the public site output

## Common Commands

```bash
bun run dev
bun run worktree:bootstrap -- --force
bun run migrate
bun run seed
bun run dev-db:reset
bun run test-env:reset
bun run test-data:generate
bun run test-data:verify
bun run frontend:package-media
bun run frontend:verify-media
bun run pwa:verify-edgeone-artifact
```

Set `PUBLIC_MEDIA_ARTIFACT_DIR=./edgeone-dist` to make the media verifier inspect the final staged EdgeOne directory; it defaults to `site-dist` for local frontend checks.

## Notes

- Scripts should assume the repository uses local filesystem content only.
- Use `DB_PATH` and `LOCAL_CONTENT_BASE_PATH` explicitly when running data-affecting scripts.
- New scripts should support `--help`, exit non-zero on failure, and prefer kebab-case filenames.
- Linked worktree bootstrap is automatic only on the first checkout of a new worktree; later reruns should use `bun run worktree:bootstrap -- --force`.

## 项目图片增量缓存

`generate:project-posters` 和 `generate:project-social-previews` 共用 `.cache/project-media/v1`，按源图字节、文件身份、生成脚本、media 规则、Bun、sharp/libvips 与运行平台决定条目。未变化的图片复用已校验的 AVIF/WebP 与占位图，manifest 每次按当前源图集合生成；删除或重命名源图会清理受管理的孤儿产物。URL、质量和体积预算不变，原图仍不进入 public。

缓存缺失、损坏或不可写时正常生成；编码或预算校验失败仍使构建失败。生成器的可选 `cacheDir` 用于隔离验证，`cacheStats` 返回命中、重建与不可用次数；默认命令会打印这些统计及耗时。不要手工复制最终应用产物来代替图片缓存。

Actions 的 `setup-project-media` 在安装依赖后恢复同配方的聚合缓存，并在 job 成功后保存新源图集合的精确键；首次并行冷启动可能重复生成。Docker `project-media` 阶段独立于应用源码和构建身份，builder 继续运行真实生成器并校验缓存。

性能实验通过现有 CI/CD Pipeline 的 `workflow_dispatch` 输入 `project_media_cache_proof=true` 启用，在现有 Build/Docker job 内分别运行 `benchmark-project-media-cache.ts` 和 `verify-project-media-docker-cache.ts`。实验使用临时目录，覆盖完整素材冷生成、三次暖运行、单图变化和 Docker 无关源码/身份变化；不发布镜像。该专用实验不运行完整产品版本矩阵，普通 dispatch 与自动 PR/main 的原有检查不变。日志中的生成收益还须扣除真实 restore/save 传输成本，不能仅以命中次数证明性能。
