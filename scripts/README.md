# Scripts

Key project scripts live in this directory. Use Bun unless a shell script is explicitly listed.

## Core

- `generate-version.ts`: generate build version metadata
- `migrate.ts`: run Drizzle migrations
- `seed.ts`: seed or clear SQLite data
- `start-gateway.ts`: start the Bun gateway runtime
- `generate-test-data.ts`: create dev/test local content fixtures
- `trigger-sync.ts`: run content sync against the configured local content root
- `verify-test-data.ts`: validate generated fixture shape

## Common Commands

```bash
bun run dev
bun run migrate
bun run seed
bun run dev-db:reset
bun run test-env:reset
bun run test-data:generate
bun run test-data:verify
```

## Notes

- Scripts should assume the repository uses local filesystem content only.
- Use `DB_PATH` and `LOCAL_CONTENT_BASE_PATH` explicitly when running data-affecting scripts.
- New scripts should support `--help`, exit non-zero on failure, and prefer kebab-case filenames.
