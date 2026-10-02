import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEditionIdentity } from "../../src/lib/playbook/manifest";

// Runs against a built console with the same fixed public fixture as site-dist.
const identity = parseEditionIdentity(
  JSON.parse(await readFile("site-dist/_content/playbook/manifest.json", "utf8"))
);
for (const route of ["topics/delivery", "projects/sample-project", "policies/safe-release"]) {
  const html = await readFile(resolve("site-dist/playbook", route, "index.html"), "utf8");
  if (
    !html.includes(`data-playbook-edition="${identity.editionDigest}"`) ||
    !html.includes("内容版本")
  )
    throw new Error("Static HTML does not contain the fixed edition");
}
const port = "35091";
await mkdir(".tmp", { recursive: true });
const cacheRoot = await mkdtemp(resolve(".tmp/smoke-playbook-"));
const child = Bun.spawn(["bun", "scripts/start-console.ts"], {
  env: {
    ...process.env,
    NODE_ENV: "test",
    CONSOLE_RUNTIME: "true",
    PORT: port,
    BIND_HOST: "127.0.0.1",
    PLAYBOOK_SYNC_ENABLED: "false",
    PLAYBOOK_CACHE_DIR: cacheRoot,
  },
  stdout: "inherit",
  stderr: "inherit",
});
let shutdownStatus = 0;
try {
  let response: Response | undefined;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      response = await fetch(`http://127.0.0.1:${port}/playbook/topics/delivery/`);
      if (response.ok) break;
    } catch {
      /* Startup has not opened the listener yet. */
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  if (!response?.ok) throw new Error("Console did not become ready");
  const html = await response.text();
  if (
    !html.includes("稳定发布") ||
    !html.includes('id="release"') ||
    !html.includes(`data-playbook-edition="${identity.editionDigest}"`)
  )
    throw new Error("Console first response is missing Playbook SSR content");
  const search = await fetch(
    `http://127.0.0.1:${port}/api/public/playbook/search-index?edition=${identity.editionDigest}&sourceReleaseId=${identity.source.releaseId}&sourceTag=${identity.source.tag}`
  );
  if (!search.ok || !(await search.text()).includes("Safe Release"))
    throw new Error("Console has no matching search edition");
  const conflict = await fetch(
    `http://127.0.0.1:${port}/api/public/playbook/search-index?edition=${"0".repeat(64)}&sourceReleaseId=${identity.source.releaseId}&sourceTag=${identity.source.tag}`
  );
  if (conflict.status !== 409) throw new Error("Unknown search edition did not require a refresh");
  console.log("Verified static HTML, first-response console SSR and edition-bound HTTP search");
} finally {
  child.kill("SIGTERM");
  shutdownStatus = await child.exited;
  await rm(cacheRoot, { recursive: true, force: true });
}
if (shutdownStatus !== 0) throw new Error("Console did not shut down cleanly after SIGTERM");
