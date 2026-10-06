import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import contractJson from "../../.github/release-contract.json";
import { findArtifact, sealDirectory, verifyDirectory } from "../../src/lib/release/artifacts";
import { GitHubRelease } from "../../src/lib/release/github";
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
  test("lost artifacts before ledger binding cannot cause re-freezing or rebuilding", () => {
    const { entry: original } = frozenStore();
    const entry = { ...original, stage: "merged" as const, products: undefined, inputs: undefined };
    let completedStep = "";
    let previousStatus = "completed";
    const github = new GitHubRelease(contract, "github-actions", {
      request(endpoint) {
        if (endpoint.includes("/artifacts?")) return [{ artifacts: [] }];
        if (endpoint.endsWith("/runs/7"))
          return {
            id: 7,
            run_attempt: 2,
            event: "workflow_run",
            path: ".github/workflows/product-release.yml",
            head_branch: "main",
            head_repository: { full_name: contract.repository },
          };
        if (endpoint.includes("/jobs?"))
          return [
            {
              jobs: [
                {
                  name: "production",
                  status: endpoint.includes("/attempts/1/") ? previousStatus : "in_progress",
                  steps:
                    endpoint.includes("/attempts/1/") && completedStep
                      ? [{ name: completedStep, status: "completed", conclusion: "success" }]
                      : [],
                },
              ],
            },
          ];
        throw new Error(`Unexpected read ${endpoint}`);
      },
      command() {
        throw new Error("Recovery validation cannot issue external writes");
      },
    });
    expect(findArtifact(github, entry, "inputs")).toBeUndefined();
    expect(findArtifact(github, entry, "products")).toBeUndefined();
    for (const [kind, step] of [
      ["inputs", "Freeze public build inputs under the production lock"],
      ["inputs", "Retain frozen inputs for 90 days"],
      ["products", "Build the static frontend and full-feature image"],
      ["products", "Retain both immutable products for 90 days"],
    ] as const) {
      completedStep = step;
      expect(() => findArtifact(github, entry, kind)).toThrow("lost");
    }
    completedStep = "";
    previousStatus = "in_progress";
    expect(() => findArtifact(github, entry, "inputs")).toThrow("unavailable");
  });
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
