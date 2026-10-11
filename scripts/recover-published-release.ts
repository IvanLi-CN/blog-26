import { readFile } from "node:fs/promises";
import { z } from "zod";
import { publicVersionSchema } from "../src/lib/release/deployment";
import { GitHubLedgerStore, GitHubRelease } from "../src/lib/release/github";
import { changeLedger, updateRelease } from "../src/lib/release/ledger";
import { assertProductionOwner, promoteLatest } from "../src/lib/release/publication";
import { readContract } from "../src/lib/release/source";

const contract = readContract();
const identity = process.env.RELEASE_ID || "";
const manifestPath = process.env.RELEASE_MANIFEST_PATH || "release-manifest.json";

if (!identity) throw new Error("RELEASE_ID is required");

const manifest = z
  .object({
    identity: z.string(),
    productVersion: z.string(),
    sourceSha: z.string(),
    staticSha256: z.string(),
    imageDigest: z.string(),
    playbookEdition: z.string(),
  })
  .strict()
  .parse(JSON.parse(await readFile(manifestPath, "utf8")));

const site = new URL(process.env.PUBLIC_SITE_URL || "https://ivanli.cc/");
const response = await fetch(new URL("version.json", site), {
  redirect: "error",
  cache: "no-store",
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error("Published site version endpoint is unavailable");
const version = publicVersionSchema.parse(await response.json());
const pointerResponse = await fetch(new URL("_content/playbook/manifest.json", site), {
  redirect: "error",
  cache: "no-store",
  signal: AbortSignal.timeout(30_000),
});
if (!pointerResponse.ok) throw new Error("Published Playbook pointer is unavailable");
const pointer = z
  .object({ editionDigest: z.string(), rendererCommit: z.string() })
  .parse(await pointerResponse.json());

const app = new GitHubRelease(contract, "github-actions");
const store = new GitHubLedgerStore(app);
const current = await store.read();
const entry = current.ledger.entries.find((item) => item.id === identity);
if (entry?.stage !== "published" || !entry.products || !entry.publication)
  throw new Error("Published release identity is not recoverable");
if (
  manifest.identity !== entry.id ||
  manifest.productVersion !== entry.version ||
  manifest.sourceSha !== entry.mergeSha ||
  manifest.staticSha256 !== entry.products.staticSha256 ||
  manifest.imageDigest !== entry.products.imageDigest ||
  version.productVersion !== entry.version ||
  version.sourceSha !== entry.mergeSha ||
  pointer.editionDigest !== manifest.playbookEdition ||
  pointer.rendererCommit !== entry.mergeSha
)
  throw new Error("Published site does not match the frozen release identity");

const deployment = {
  url: site.toString(),
  productVersion: entry.version,
  sourceSha: entry.mergeSha,
  staticSha256: entry.products.staticSha256,
};
await changeLedger(store, (ledger) => ({
  ledger: updateRelease(ledger, identity, {
    deployment,
    stage: "deployed",
    failure: undefined,
  }),
  result: null,
}));

const deployed = (await store.read()).ledger.entries.find((item) => item.id === identity);
if (!deployed) throw new Error("Recovered deployment ledger entry is missing");
await assertProductionOwner(app, (await store.read()).ledger, deployed);
await promoteLatest(app, deployed);
await changeLedger(store, (ledger) => ({
  ledger: updateRelease(ledger, identity, {
    latestVerified: true,
    stage: "complete",
    failure: undefined,
  }),
  result: null,
}));

console.log(`Completed recovery for v${entry.version}`);
