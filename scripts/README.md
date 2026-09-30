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
