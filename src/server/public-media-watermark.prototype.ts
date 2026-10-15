/**
 * THROWAWAY: Does the approved Iv mark work as a media watermark?
 * Three compositions on one local artifact, switched by ?variant=A|B|C.
 * Run: bun src/server/public-media-watermark.prototype.ts
 * This script is outside the product router and is never imported by production.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const outputDir = resolve(process.env.WATERMARK_PROTOTYPE_OUTPUT || "tmp/watermark-prototype");
const source = await readFile(resolve(root, "site/assets/brand/source/ivan-blog-mark.svg"), "utf8");
const paths = source.match(/<path[^>]*\/>/gu)?.join("") || "";
const scenes = await Promise.all(
  [
    ["light", "浅色产品图", "site/assets/projects/social-source/loadlynx-light.png"],
    ["dark", "深色产品图", "site/assets/projects/social-source/loadlynx-dark.png"],
    ["busy", "复杂背景", "site/assets/projects/social-source/iso-usb-hub-light.png"],
  ].map(async ([key, label, path]) => ({
    key,
    label,
    source: path,
    url: `data:image/png;base64,${(await readFile(resolve(root, path))).toString("base64")}`,
  }))
);
const template = await readFile(
  resolve(import.meta.dir, "public-media-watermark.prototype.html"),
  "utf8"
);
const html = template.replace(
  'const DATA = /* PROTOTYPE_DATA */ { paths: "", scenes: [] };',
  `const DATA = ${JSON.stringify({ paths, scenes }).replace(/</gu, "\\u003c")};`
);
await mkdir(outputDir, { recursive: true });
await Bun.write(resolve(outputDir, "index.html"), html);
console.log(`Standalone prototype: ${resolve(outputDir, "index.html")}`);
if (process.argv.includes("--render-only")) process.exit(0);
if (process.env.NODE_ENV === "production") throw new Error("This prototype is development-only.");

const codexRoot = process.env.CODEX_HOME || resolve(process.env.HOME || "", ".codex");
const registry = resolve(codexRoot, "skills/global-port-manager/scripts/port_registry.py");
const scope = `blog-26--${createHash("sha256").update(root).digest("hex").slice(0, 8)}--watermark-prototype`;
const branch =
  Bun.spawnSync(["git", "branch", "--show-current"], { cwd: root }).stdout.toString().trim() ||
  `detached-${Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], { cwd: root }).stdout.toString().trim()}`;
function lease(args: string[]) {
  const result = Bun.spawnSync(["python3", registry, "--json", ...args], { cwd: root });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return JSON.parse(result.stdout.toString());
}
const allocation = lease([
  "allocate",
  "--scope-id",
  scope,
  "--project",
  "blog-26",
  "--repo-root",
  root,
  "--branch",
  branch,
  "--worktree-path",
  root,
  "--service",
  "watermark-prototype",
]);
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: allocation.port,
  fetch(request) {
    if (new URL(request.url).pathname !== "/") return new Response("Not found", { status: 404 });
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  },
});
lease([
  "heartbeat",
  "--scope-id",
  scope,
  "--service",
  "watermark-prototype",
  "--pid",
  String(process.pid),
]);
console.log(`Watermark prototype: ${server.url}  pid=${process.pid}`);
