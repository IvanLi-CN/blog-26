import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEditionIdentity, sha256 } from "../../src/lib/playbook/manifest";

// Runs against the exact public edition produced by the preceding static build.
const identity = parseEditionIdentity(
  JSON.parse(await readFile("site-dist/_content/playbook/manifest.json", "utf8"))
);
const editionRoot = resolve(
  "site-dist/_content/playbook",
  identity.source.tag,
  identity.editionDigest
);
const catalog = JSON.parse(await readFile(resolve(editionRoot, "catalog.json"), "utf8")) as {
  snapshot?: { topics?: { slug: string }[]; projects?: { slug: string }[] };
  topic_details?: { policy_skills?: { summary: { slug: string } }[] }[];
};
const routes = [
  ...(catalog.snapshot?.topics ?? []).map((topic) => `topics/${topic.slug}`),
  ...(catalog.snapshot?.projects ?? []).map((project) => `projects/${project.slug}`),
  ...(catalog.topic_details ?? [])
    .flatMap((topic) => topic.policy_skills ?? [])
    .map((policy) => `policies/${policy.summary.slug}`),
];
const pageRoutes = [...new Set(["", ...routes])];
for (const route of pageRoutes) {
  const html = await readFile(
    resolve("site-dist/playbook", ...(route ? route.split("/") : []), "index.html"),
    "utf8"
  );
  if (
    !html.includes(`data-playbook-edition="${identity.editionDigest}"`) ||
    /内容版本\s*(?:<[^>]*>\s*)*v\d/iu.test(html)
  )
    throw new Error("Static HTML does not contain the fixed edition");
}
const searchBytes = await readFile(resolve(editionRoot, "search-documents.json"));
const searchPayload = JSON.parse(searchBytes.toString("utf8")) as { documents?: unknown[] };
if (!Array.isArray(searchPayload.documents)) throw new Error("Static search output is invalid");
await mkdir(".tmp", { recursive: true });
const cacheRoot = await mkdtemp(resolve(".tmp/smoke-playbook-"));
const child = Bun.spawn(["bun", "scripts/start-console.ts"], {
  env: {
    ...process.env,
    NODE_ENV: "test",
    CONSOLE_RUNTIME: "true",
    PORT: "0",
    BIND_HOST: "127.0.0.1",
    PLAYBOOK_SYNC_ENABLED: "false",
    PLAYBOOK_CACHE_DIR: cacheRoot,
  },
  stdout: "pipe",
  stderr: "inherit",
});
const stdout = child.stdout;
if (!stdout) throw new Error("Console smoke test did not expose child stdout");
const reader = stdout.getReader();
const decoder = new TextDecoder();
let output = "";
let port: string | undefined;
while (!port) {
  const { value, done } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value, { stream: true });
  output += chunk;
  process.stdout.write(chunk);
  const match = output.match(/\[console\] listening on http:\/\/127\.0\.0\.1:(\d+)/);
  if (match) port = match[1];
}
reader.releaseLock();
if (!port) {
  child.kill("SIGTERM");
  await child.exited;
  await rm(cacheRoot, { recursive: true, force: true });
  throw new Error(`Console did not expose a listening port: ${output}`);
}
let shutdownStatus = 0;
try {
  let response: Response | undefined;
  const primaryRoute = routes[0] || "";
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      response = await fetch(
        `http://127.0.0.1:${port}/playbook/${primaryRoute ? `${primaryRoute}/` : ""}`
      );
      if (response.ok) break;
    } catch {
      /* Startup has not opened the listener yet. */
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  if (!response?.ok) throw new Error("Console did not become ready");
  const html = await response.text();
  if (
    !html.includes(`data-playbook-edition="${identity.editionDigest}"`) ||
    /内容版本\s*(?:<[^>]*>\s*)*v\d/iu.test(html)
  )
    throw new Error("Console first response is missing Playbook SSR content");
  const search = await fetch(
    `http://127.0.0.1:${port}/api/public/playbook/search-index?edition=${identity.editionDigest}&sourceReleaseId=${identity.source.releaseId}&sourceTag=${encodeURIComponent(identity.source.tag)}`
  );
  const searchText = await search.text();
  if (!search.ok || sha256(searchText) !== sha256(searchBytes))
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
