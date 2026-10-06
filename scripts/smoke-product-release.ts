import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { bytesDigest } from "../src/lib/release/artifacts";
import { publicVersionSchema, unpackStatic } from "../src/lib/release/deployment";
import { buildCommand } from "../src/lib/release/inputs";
import { entrySchema } from "../src/lib/release/ledger";

const work = resolve(process.env.RUNNER_TEMP || ".tmp", "product-release");
const entry = entrySchema.parse(JSON.parse(await readFile(resolve(work, "entry.json"), "utf8")));
const manifest = await unpackStatic(
  entry,
  resolve(work, "products"),
  resolve(work, "static-smoke")
);
const imageManifest = execFileSync("skopeo", [
  "inspect",
  "--raw",
  `oci-archive:${resolve(work, "products/image.oci.tar")}`,
]);
if (`sha256:${bytesDigest(imageManifest)}` !== manifest.imageDigest)
  throw new Error("Frozen OCI manifest digest differs from its declared product");
const image = `blog26-release-smoke:${entry.id.slice(0, 24)}`;
const container = `blog26-release-smoke-${entry.id.slice(0, 24)}`;
await buildCommand([
  "skopeo",
  "copy",
  `oci-archive:${resolve(work, "products/image.oci.tar")}`,
  `docker-daemon:${image}`,
]);
let started = false;
try {
  const id = execFileSync(
    "docker",
    [
      "run",
      "--detach",
      "--name",
      container,
      "--publish",
      "127.0.0.1::25090",
      "--env",
      "LLM_SETTINGS_MASTER_KEY=release-smoke-only-key-never-used-in-production",
      "--env",
      "PUBLIC_API_BASE_URL=https://console.ivanli.cc",
      "--env",
      "PUBLIC_MEDIA_IMAGOR_BASE_URL=http://127.0.0.1:9",
      "--env",
      "PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL=http://127.0.0.1:9",
      "--env",
      "PUBLIC_MEDIA_INTERNAL_SOURCE_SECRET=release-smoke-only",
      "--env",
      "CONTENT_SOURCES=local",
      "--env",
      "LOCAL_CONTENT_BASE_PATH=/app/data/local",
      image,
    ],
    { encoding: "utf8" }
  ).trim();
  started = Boolean(id);
  const address = execFileSync("docker", ["port", container, "25090/tcp"], {
    encoding: "utf8",
  }).trim();
  if (!/^127\.0\.0\.1:\d+$/.test(address))
    throw new Error("Smoke container must be bound to runner loopback only");
  const origin = `http://${address}`;
  let healthy = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      healthy = (await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(2000) })).ok;
    } catch {
      healthy = false;
    }
    if (healthy) break;
    await new Promise((done) => setTimeout(done, 2000));
  }
  if (!healthy) throw new Error("Frozen image did not become healthy in production mode");
  const version = publicVersionSchema.parse(await (await fetch(`${origin}/api/version`)).json());
  if (
    version.productVersion !== entry.version ||
    version.sourceSha !== entry.mergeSha ||
    version.buildVersion !== manifest.imageBuildVersion
  )
    throw new Error("Image and static product metadata differ from the same release identity");
  for (const path of ["/admin/", "/playbook/"]) {
    const response = await fetch(`${origin}${path}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status >= 500) throw new Error(`Complete image runtime failed at ${path}`);
  }
  console.log(
    `Production smoke passed: v${entry.version}, source ${entry.mergeSha}, static + full-feature Docker image`
  );
} finally {
  if (started) execFileSync("docker", ["rm", "--force", container], { stdio: "ignore" });
}
