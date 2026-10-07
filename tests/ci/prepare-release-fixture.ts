/** Non-production frozen inputs for candidate build/smoke validation. Never publishes. */
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { packagePublicMedia } from "../../scripts/package-public-media";
import { writePublicEdition } from "../../src/lib/playbook/artifacts";
import { readPlaybookEdition } from "../../src/lib/playbook/bundle";
import { encodeJson } from "../../src/lib/playbook/manifest";
import { sealDirectory } from "../../src/lib/release/artifacts";
import { buildCommand, frozenConfigSchema } from "../../src/lib/release/inputs";
import { entrySchema } from "../../src/lib/release/ledger";
import { canonicalJson, digest } from "../../src/lib/release/policy";
import { imageVersionTag } from "../../src/lib/release/version";
import { makePublicBundle } from "../lib/playbook-fixture";

const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const storedVersion = (await readFile("VERSION", "utf8")).trim();
const version = process.env.PRODUCT_RELEASE_FIXTURE_VERSION || storedVersion;
imageVersionTag(version);
// Only this non-production fixture prepares alternate VERSION bytes in its disposable checkout.
if (version !== storedVersion) await writeFile("VERSION", `${version}\n`);
const work = resolve(process.env.RUNNER_TEMP || ".tmp", "product-release");
const inputs = resolve(work, "inputs");
const bundleRoot = resolve(work, "fixture-bundle");
await mkdir(inputs, { recursive: true });
await mkdir(bundleRoot, { recursive: true });
const bundle = makePublicBundle();
await writeFile(resolve(bundleRoot, "playbook-public-manifest.json"), encodeJson(bundle.manifest));
await writeFile(resolve(bundleRoot, "playbook-public.tar.gz"), bundle.archive);
const snapshot = await readFile("site/generated/public-snapshot.json");
const edition = await readPlaybookEdition(bundleRoot, sourceSha, snapshot);
await writePublicEdition(resolve(work, "fixture-public"), edition, bundleRoot, snapshot);
await cp(resolve(work, "fixture-public/_content/playbook"), resolve(inputs, "playbook"), {
  recursive: true,
});
await writeFile(resolve(inputs, "playbook-edition.json"), encodeJson(edition));
await writeFile(resolve(inputs, "public-snapshot.json"), snapshot);
await buildCommand(["bun", "scripts/update-llm-model-catalog.ts"], {
  LLM_MODEL_CATALOG_SKIP_REFRESH: "true",
});
await cp("src/generated/llm-model-catalog.json", resolve(inputs, "llm-model-catalog.json"));
for (const path of ["bun.lock", "package.json"]) await cp(path, resolve(inputs, path));
await mkdir(resolve(inputs, "media"), { recursive: true });
await writeFile(resolve(inputs, "media/snapshot.json"), snapshot);
await packagePublicMedia({
  siteDistDir: resolve(inputs, "media"),
  mediaOrigin: "https://console.ivanli.cc",
  siteUrl: "https://ivanli.cc",
  fetchImpl: async () =>
    new Response(Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAA==", "base64")),
});
const identity = {
  version,
  sourceSha,
  policyDigest: digest("candidate-fixture"),
  evidenceDigest: digest("candidate-fixture"),
  versionInput: version,
};
const entry = entrySchema.parse({
  ...identity,
  id: digest(identity),
  baselineVersion: "2.7.0",
  baselineSha: sourceSha,
  impact: "minor",
  actor: "candidate-fixture",
  preparationRunId: 1,
  stage: "merged",
  mergeSha: sourceSha,
  releaseRunId: 1,
  createdAt: "2026-10-07T00:00:00Z",
  updatedAt: "2026-10-07T00:00:00Z",
});
await writeFile(resolve(work, "entry.json"), canonicalJson(entry));
function baseImage(tag: string) {
  try {
    const cached = execFileSync(
      "docker",
      ["image", "inspect", tag, "--format", "{{index .RepoDigests 0}}"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    ).trim();
    if (/^oven\/bun@sha256:[a-f0-9]{64}$/.test(cached)) return cached;
  } catch {
    /* A fixture can reuse its verified local digest; acquisition is only needed when absent. */
  }
  execFileSync("docker", ["pull", "--platform", "linux/amd64", tag], { stdio: "inherit" });
  return execFileSync("docker", ["image", "inspect", tag, "--format", "{{index .RepoDigests 0}}"], {
    encoding: "utf8",
  }).trim();
}
const config = frozenConfigSchema.parse({
  schemaVersion: 1,
  identity: entry.id,
  productVersion: version,
  sourceSha,
  buildDate: entry.createdAt,
  bunVersion: "1.4.2",
  nodeVersion: "v22.23.2",
  baseImages: { build: baseImage("oven/bun:1.4.2"), runtime: baseImage("oven/bun:1.4.2-slim") },
  env: {
    PUBLIC_API_BASE_URL: "https://console.ivanli.cc",
    PUBLIC_SITE_URL: "https://ivanli.cc",
    PUBLIC_SITE_BASE_PATH: "/",
  },
});
await writeFile(resolve(inputs, "config.json"), canonicalJson(config));
await sealDirectory(inputs, entry, "inputs");
console.log(`Prepared non-production frozen candidate: ${sourceSha}`);
