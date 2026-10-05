import { resolve } from "node:path";

const fixtureRoot = resolve(".tmp/project-tags-demo");
async function run(args: string[], env: Record<string, string> = {}) {
  const process = Bun.spawn(args, {
    stdout: "inherit",
    stderr: "inherit",
    env: { ...Bun.env, ...env },
  });
  const code = await process.exited;
  if (code !== 0) throw new Error(`${args.join(" ")} exited ${code}`);
}
await run(["bun", "tests/lib/project-tags-fixture.ts", `${fixtureRoot}/public-snapshot.json`]);
await run(["bun", "tests/lib/playbook-fixture.ts", `${fixtureRoot}/playbook`]);
await run(["bun", "run", "site:build"], {
  CONSOLE_RUNTIME: "false",
  PUBLIC_SNAPSHOT_PATH: `${fixtureRoot}/public-snapshot.json`,
  PUBLIC_CONTENT_BUNDLE_URL: "preloaded",
  PUBLIC_SITE_URL: "https://example.test",
  PUBLIC_SITE_BASE_PATH: Bun.env.PUBLIC_SITE_BASE_PATH ?? "",
  PLAYBOOK_BUNDLE_DIR: `${fixtureRoot}/playbook`,
  PLAYBOOK_USE_DEPLOYED: "false",
});
