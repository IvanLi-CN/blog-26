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
function frozenStore(version = "") {
  const first = reserveRelease(initialLedger(contract), {
    sourceSha: "b".repeat(40),
    policyDigest: "c".repeat(64),
    evidenceDigest: "d".repeat(64),
    actor: "owner",
    impact: "minor",
    preparationRunId: 1,
    version,
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
  const pointers = {
    githubLatest: { id: 1, tag: "v2.7.0" },
    imageLatest: `sha256:${"a".repeat(64)}`,
    siteVersion: { productVersion: "2.7.0", buildVersion: "production", sourceSha: "a".repeat(40) },
    playbookPointer: { editionDigest: "a".repeat(64), rendererCommit: "a".repeat(40) },
  };
  for (const phase of ["alpha", "beta", "rc"]) {
    test(`${phase} publishes two products and completes without deploying or promoting`, async () => {
      const { store, id, entry } = frozenStore(phase);
      let attempts = 0;
      const ports: PublicationPorts = {
        async productionPointers() {
          return pointers;
        },
        async publish() {
          if (++attempts === 1) throw new Error("partial publication failure");
          return proofs(entry).publication;
        },
        async deploy() {
          throw new Error("prerelease must not deploy");
        },
        async promote() {
          throw new Error("prerelease must not promote");
        },
      };
      await expect(finishRelease(store, id, ports)).rejects.toThrow("partial publication");
      const completed = await finishRelease(store, id, ports);
      expect(completed).toMatchObject({
        stage: "complete",
        deploymentStatus: "not-applicable",
        latestStatus: "not-applicable",
        productionBefore: pointers,
        productionAfter: pointers,
      });
      expect(completed.deployment).toBeUndefined();
      expect(completed.latestVerified).toBeUndefined();
      ports.productionPointers = async () => {
        throw new Error("completed retry must not inspect newer production");
      };
      expect((await finishRelease(store, id, ports)).id).toBe(id);
      expect(attempts).toBe(2);
    });
  }
  test("unavailable or changed production observations never prove isolation", async () => {
    const { store, id, entry } = frozenStore("alpha");
    let reads = 0;
    const ports: PublicationPorts = {
      async productionPointers() {
        if (++reads === 1) throw new Error("pointer unavailable");
        return reads === 2 ? pointers : { ...pointers, imageLatest: `sha256:${"b".repeat(64)}` };
      },
      async publish() {
        return proofs(entry).publication;
      },
      async deploy() {
        throw new Error("unexpected deploy");
      },
      async promote() {
        throw new Error("unexpected promotion");
      },
    };
    await expect(finishRelease(store, id, ports)).rejects.toThrow("unavailable");
    await expect(finishRelease(store, id, ports)).rejects.toThrow();
    expect((await store.read()).ledger.entries[0]?.stage).toBe("published");
  });
  test("production isolation proofs cannot be attached before their verified stage", async () => {
    const { store, id } = frozenStore("alpha");
    const { ledger } = await store.read();
    expect(() => updateRelease(ledger, id, { productionAfter: pointers })).toThrow("precede");
    expect(() => updateRelease(ledger, id, { deploymentStatus: "not-applicable" })).toThrow(
      "completion"
    );
  });
  test("a failed publication ledger write recovers using the original immutable products", async () => {
    const { store, id, entry } = frozenStore("alpha");
    let fail = true;
    const interrupted: LedgerStore = {
      read: () => store.read(),
      async compareAndSwap(expected, next) {
        if (fail && next.entries.some((item) => item.stage === "published")) {
          fail = false;
          throw new Error("injected publication ledger failure");
        }
        return store.compareAndSwap(expected, next);
      },
    };
    let publishCalls = 0;
    const ports: PublicationPorts = {
      async productionPointers() {
        return pointers;
      },
      async publish(identity) {
        publishCalls++;
        expect(identity.id).toBe(id);
        expect(identity.products).toEqual(entry.products);
        return proofs(identity).publication;
      },
      async deploy() {
        throw new Error("prerelease must not deploy");
      },
      async promote() {
        throw new Error("prerelease must not promote");
      },
    };
    await expect(finishRelease(interrupted, id, ports)).rejects.toThrow("ledger failure");
    expect((await store.read()).ledger.entries[0]?.stage).toBe("frozen");
    const recovered = await finishRelease(interrupted, id, ports);
    expect(recovered.stage).toBe("complete");
    expect(recovered.products).toEqual(entry.products);
    expect(publishCalls).toBe(2);
  });
  test("lost artifacts before ledger binding cannot cause re-freezing or rebuilding", () => {
    const { entry: original } = frozenStore();
    const entry = { ...original, stage: "merged" as const, products: undefined, inputs: undefined };
    let completedStep = "";
    let previousStatus = "completed";
    let conclusion: string | null = "success";
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
                      ? [{ name: completedStep, status: "completed", conclusion }]
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
    for (const kind of ["inputs", "products"] as const) {
      completedStep =
        kind === "inputs"
          ? "Freeze public build inputs under the production lock"
          : "Build the static frontend and full-feature image";
      for (conclusion of ["failure", "cancelled"])
        expect(findArtifact(github, entry, kind)).toBeUndefined();
      conclusion = null;
      expect(() => findArtifact(github, entry, kind)).toThrow("unavailable");
      conclusion = "skipped";
      expect(findArtifact(github, entry, kind)).toBeUndefined();
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
