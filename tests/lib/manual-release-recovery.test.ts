import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import contractJson from "../../.github/release-contract.json";
import { sealDirectory, verifyDirectory } from "../../src/lib/release/artifacts";
import {
  initialLedger,
  type LedgerStore,
  type ReleaseEntry,
  reserveRelease,
  updateRelease,
} from "../../src/lib/release/ledger";
import { contractSchema } from "../../src/lib/release/policy";
import { finishRelease, type PublicationPorts } from "../../src/lib/release/publication";

const contract = contractSchema.parse(contractJson);
function frozenStore() {
  const first = reserveRelease(initialLedger(contract), {
    sourceSha: "b".repeat(40),
    policyDigest: "c".repeat(64),
    evidenceDigest: "d".repeat(64),
    actor: "owner",
    impact: "minor",
    preparationRunId: 1,
  });
  let ledger = updateRelease(first.ledger, first.entry.id, {
    stage: "pr_open",
    preparationHead: "e".repeat(40),
    prNumber: 4,
  });
  ledger = updateRelease(ledger, first.entry.id, {
    stage: "merged",
    mergeSha: "f".repeat(40),
    releaseRunId: 7,
  });
  const reference = {
    runId: 7,
    artifactId: 10,
    artifactName: `release-${first.entry.id}-inputs`,
    archiveDigest: `sha256:${"1".repeat(64)}`,
    manifestDigest: "2".repeat(64),
  };
  ledger = updateRelease(ledger, first.entry.id, {
    stage: "frozen",
    inputs: reference,
    products: {
      ...reference,
      artifactId: 11,
      artifactName: `release-${first.entry.id}-products`,
      staticSha256: "3".repeat(64),
      imageSha256: "4".repeat(64),
      imageDigest: `sha256:${"5".repeat(64)}`,
    },
  });
  let revision = "initial";
  const store: LedgerStore = {
    async read() {
      return { sha: revision, ledger: structuredClone(ledger) };
    },
    async compareAndSwap(expected, next) {
      if (expected !== revision) throw new Error("CAS conflict");
      ledger = next;
      revision += "1";
      return revision;
    },
  };
  const entry = ledger.entries[0];
  if (!entry) throw new Error("Missing frozen fixture");
  return { store, id: first.entry.id, entry };
}
function proofs(entry: ReleaseEntry) {
  return {
    publication: {
      releaseId: 20,
      staticAssetId: 21,
      manifestAssetId: 22,
      imageDigest: entry.products?.imageDigest || "",
    },
    deployment: {
      url: "https://ivanli.cc/",
      productVersion: entry.version,
      sourceSha: entry.mergeSha || "",
      staticSha256: entry.products?.staticSha256 || "",
    },
  };
}
describe("frozen release recovery", () => {
  test("deployment failure resumes without republishing either immutable product", async () => {
    const { store, id, entry } = frozenStore();
    const proof = proofs(entry);
    let publications = 0;
    let deployments = 0;
    let promotions = 0;
    const ports: PublicationPorts = {
      async publish() {
        publications++;
        return proof.publication;
      },
      async deploy() {
        deployments++;
        if (deployments === 1) throw new Error("injected deployment failure");
        return proof.deployment;
      },
      async promote() {
        promotions++;
      },
    };
    await expect(finishRelease(store, id, ports)).rejects.toThrow("injected");
    expect((await store.read()).ledger.entries[0]?.stage).toBe("published");
    const completed = await finishRelease(store, id, ports);
    expect(completed.stage).toBe("complete");
    await finishRelease(store, id, ports);
    expect([publications, deployments, promotions]).toEqual([1, 2, 1]);
  });
  test("latest failure retains the verified deployment and retries only promotion", async () => {
    const { store, id, entry } = frozenStore();
    const proof = proofs(entry);
    let promoted = 0;
    const ports: PublicationPorts = {
      async publish() {
        return proof.publication;
      },
      async deploy() {
        return proof.deployment;
      },
      async promote() {
        if (++promoted === 1) throw new Error("injected latest failure");
      },
    };
    await expect(finishRelease(store, id, ports)).rejects.toThrow("latest");
    expect((await store.read()).ledger.entries[0]?.stage).toBe("deployed");
    expect((await finishRelease(store, id, ports)).stage).toBe("complete");
    expect(promoted).toBe(2);
  });
  test("missing and conflicting frozen bytes block recovery before external writes", async () => {
    const { entry } = frozenStore();
    const root = await mkdtemp(join(tmpdir(), "release-integrity-"));
    await writeFile(join(root, "snapshot.json"), "original");
    await sealDirectory(root, entry, "inputs");
    await verifyDirectory(root, entry, "inputs");
    await writeFile(join(root, "snapshot.json"), "changed");
    await expect(verifyDirectory(root, entry, "inputs")).rejects.toThrow("bytes");
    const other = { ...entry, id: "0".repeat(64) };
    await expect(verifyDirectory(root, other, "inputs")).rejects.toThrow("provenance");
  });
});
