import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import contractJson from "../../.github/release-contract.json";
import { fileDigest } from "../../src/lib/release/artifacts";
import { initialLedger, reserveRelease, updateRelease } from "../../src/lib/release/ledger";
import { contractSchema } from "../../src/lib/release/policy";
import { readFrozenMediaPreflight } from "../../src/lib/release/products";

const contract = contractSchema.parse(contractJson);

async function fixture() {
  const reserved = reserveRelease(initialLedger(contract), {
    sourceSha: "b".repeat(40),
    policyDigest: "c".repeat(64),
    evidenceDigest: "d".repeat(64),
    impact: "minor",
    actor: "owner",
    preparationRunId: 1,
  });
  let ledger = updateRelease(reserved.ledger, reserved.entry.id, {
    stage: "pr_open",
    preparationHead: "e".repeat(40),
    prNumber: 4,
  });
  ledger = updateRelease(ledger, reserved.entry.id, {
    stage: "merged",
    mergeSha: "b".repeat(40),
    releaseRunId: 7,
  });
  ledger = updateRelease(ledger, reserved.entry.id, {
    inputs: {
      runId: 7,
      artifactId: 10,
      artifactName: `release-${reserved.entry.id}-inputs`,
      manifestDigest: "f".repeat(64),
      archiveDigest: `sha256:${"1".repeat(64)}`,
    },
  });
  const entry = ledger.entries[0];
  if (!entry) throw new Error("Missing preflight fixture");
  const root = await mkdtemp(join(tmpdir(), "release-preflight-"));
  await mkdir(root, { recursive: true });
  const archive = join(root, "frontend.tar.gz");
  await writeFile(archive, "validated static bytes");
  await writeFile(
    join(root, "static-preflight.json"),
    JSON.stringify({
      schemaVersion: 1,
      identity: entry.id,
      productVersion: entry.version,
      sourceSha: entry.mergeSha,
      inputsManifestDigest: entry.inputs?.manifestDigest,
      staticBuildVersion: "20261007-bbbbbbbb-static",
      staticSha256: await fileDigest(archive),
      archiveName: "frontend.tar.gz",
    })
  );
  return { entry, root };
}

test("reuses static preflight output only for the same identity, source, and frozen inputs", async () => {
  const { entry, root } = await fixture();
  const inputs = entry.inputs;
  if (!inputs) throw new Error("Missing frozen input fixture");
  await expect(readFrozenMediaPreflight(entry, root)).resolves.toMatchObject({
    identity: entry.id,
    sourceSha: entry.mergeSha,
    inputsManifestDigest: entry.inputs?.manifestDigest,
  });
  await expect(readFrozenMediaPreflight({ ...entry, id: "0".repeat(64) }, root)).rejects.toThrow(
    "release identity"
  );
  await expect(
    readFrozenMediaPreflight(
      { ...entry, inputs: { ...inputs, manifestDigest: "0".repeat(64) } },
      root
    )
  ).rejects.toThrow("release identity");
});
