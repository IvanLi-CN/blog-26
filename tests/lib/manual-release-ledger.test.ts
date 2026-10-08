import { describe, expect, test } from "bun:test";
import contractJson from "../../.github/release-contract.json";
import { GitHubLedgerStore, GitHubRelease } from "../../src/lib/release/github";
import {
  changeLedger,
  initialLedger,
  type LedgerStore,
  reserveRelease,
  updateRelease,
  validateLedger,
} from "../../src/lib/release/ledger";
import { canonicalJson, contractSchema, digest } from "../../src/lib/release/policy";
import { retireStalePreparations } from "../../src/lib/release/preparation";

const contract = contractSchema.parse(contractJson);
const request = {
  sourceSha: "b".repeat(40),
  policyDigest: "c".repeat(64),
  evidenceDigest: "d".repeat(64),
  impact: "minor" as const,
  actor: "maintainer",
  preparationRunId: 1,
};

describe("durable product release reservations", () => {
  test("preserves a recovery marker carried by an ancestor ledger commit", async () => {
    const ledger = initialLedger(contract);
    const head = "c".repeat(40);
    const recoveryCommit = "b".repeat(40);
    const legacy = "d".repeat(40);
    const root = "e".repeat(40);
    const tree = "f".repeat(40);
    const digestLine = `Ledger-Digest: ${digest(ledger)}`;
    const bot = "github-actions[bot]";
    const signedOff = `Signed-off-by: ${bot} <41898282+${bot}@users.noreply.github.com>`;
    const commit = (
      sha: string,
      parent: string,
      message: string,
      author: string = bot,
      committer = "web-flow"
    ) => ({
      sha,
      author: { login: author },
      committer: { login: committer },
      parents: [{ sha: parent }],
      commit: {
        message,
        tree: { sha: tree },
        verification: { verified: true, reason: "valid" },
      },
    });
    const commits = [
      commit(
        head,
        recoveryCommit,
        `chore(release): record product delivery state\n\n${digestLine}\n${signedOff}`
      ),
      commit(
        recoveryCommit,
        legacy,
        `chore(release): record product delivery state\n\n${digestLine}\nLedger-Recovery: ${legacy}\n${signedOff}`
      ),
      commit(
        legacy,
        root,
        `chore(release): recover legacy ledger\n\n${digestLine}\n${signedOff}`,
        contract.repository.split("/")[0]
      ),
      commit(
        root,
        contract.bootstrap.sourceSha,
        `chore(release): initialize product ledger\n\nBootstrap-Source: ${contract.bootstrap.sourceSha}\n${digestLine}\n${signedOff}`
      ),
    ];
    const github = new GitHubRelease(contract, "github-actions", {
      request(endpoint) {
        if (endpoint.endsWith(`/git/ref/heads/${contract.ledgerBranch}`))
          return { object: { sha: head, type: "commit" } };
        if (endpoint.includes("/contents/ledger.json?ref="))
          return {
            encoding: "base64",
            type: "file",
            content: Buffer.from(`${canonicalJson(ledger)}\n`).toString("base64"),
          };
        if (endpoint.includes(`/commits?sha=${head}`)) return [commits];
        if (endpoint.includes("/git/commits/")) {
          const sha = endpoint.split("/").at(-1);
          const found = commits.find((item) => item.sha === sha);
          if (!found) throw new Error(`Unknown commit ${sha}`);
          return { sha: found.sha, parents: found.parents, ...found.commit };
        }
        throw new Error(`Unexpected read ${endpoint}`);
      },
      command() {
        throw new Error("Ledger reads must not issue shell commands");
      },
    });
    const result = await new GitHubLedgerStore(github).read();
    expect(result.sha).toBe(head);
    expect(result.legacySha).toBe(legacy);
    expect(result.ledger).toEqual(ledger);
  });

  test("fresh preparation retires a stale unopened reservation without replacing or reusing its identity", async () => {
    const original = reserveRelease(initialLedger(contract), request);
    let ledger = original.ledger;
    let revision = "root";
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
    const github = new GitHubRelease(contract, "github-actions", {
      request() {
        return [[]];
      },
      command() {
        throw new Error("Retiring a reservation must not publish or modify a PR");
      },
    });
    const moved = "e".repeat(40);
    await retireStalePreparations(github, store, moved, request.actor, 1);
    expect(ledger.entries[0]?.stage).toBe("reserved");
    await expect(retireStalePreparations(github, store, moved, "another", 2)).rejects.toThrow(
      "operator"
    );
    await retireStalePreparations(github, store, request.sourceSha, request.actor, 2);
    expect(ledger.entries[0]?.stage).toBe("reserved");
    await retireStalePreparations(github, store, moved, request.actor, 2);
    expect(ledger.entries[0]).toEqual({
      ...original.entry,
      stage: "abandoned",
      updatedAt: expect.any(String),
    });
    const next = reserveRelease(ledger, { ...request, sourceSha: moved, preparationRunId: 2 });
    expect(next.entry.version).toBe("2.8.1");
    expect(next.entry.id).not.toBe(original.entry.id);
    expect(() =>
      reserveRelease(ledger, {
        ...request,
        sourceSha: moved,
        version: "2.8.0",
        preparationRunId: 2,
      })
    ).toThrow();
  });
  test("a PR created before ledger binding must be closed and prove its original preparation", async () => {
    const original = reserveRelease(initialLedger(contract), request);
    let ledger = original.ledger;
    const head = "f".repeat(40);
    let state = "open";
    let parent = request.sourceSha;
    const store: LedgerStore = {
      async read() {
        return { sha: "root", ledger: structuredClone(ledger) };
      },
      async compareAndSwap(_, next) {
        ledger = next;
        return "next";
      },
    };
    const message = `Release-Identity: ${original.entry.id}\nPolicy-Digest: ${original.entry.policyDigest}\nEvidence-Digest: ${original.entry.evidenceDigest}\nSigned-off-by: github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>`;
    const github = new GitHubRelease(contract, "github-actions", {
      request(endpoint) {
        if (endpoint.includes("pulls?")) return [[{ number: 4 }]];
        if (endpoint.endsWith("/pulls/4"))
          return {
            number: 4,
            node_id: "node",
            state,
            merged: false,
            merge_commit_sha: null,
            user: { login: "github-actions[bot]" },
            auto_merge: null,
            head: {
              sha: head,
              ref: `th/release-${original.entry.id.slice(0, 24)}`,
              repo: { full_name: contract.repository },
            },
            base: { ref: "main", repo: { full_name: contract.repository } },
          };
        const commit = {
          message,
          tree: { sha: head },
          verification: { verified: true, reason: "valid" },
        };
        if (endpoint.includes("/git/commits/"))
          return { sha: head, parents: [{ sha: parent }], ...commit };
        if (endpoint.includes("/commits/"))
          return {
            sha: head,
            parents: [{ sha: parent }],
            author: { login: "github-actions[bot]" },
            committer: { login: "web-flow" },
            commit,
          };
        if (endpoint.includes("/compare/"))
          return { files: [{ filename: "VERSION" }], total_commits: 1 };
        if (endpoint.includes("/contents/VERSION"))
          return {
            encoding: "base64",
            type: "file",
            content: Buffer.from(`${original.entry.version}\n`).toString("base64"),
          };
        throw new Error(`Unexpected read ${endpoint}`);
      },
      command() {
        throw new Error("No external write");
      },
    });
    await expect(
      retireStalePreparations(github, store, "e".repeat(40), request.actor, 2)
    ).rejects.toThrow("close");
    expect(ledger.entries[0]?.stage).toBe("reserved");
    state = "closed";
    parent = "a".repeat(40);
    await expect(
      retireStalePreparations(github, store, "e".repeat(40), request.actor, 2)
    ).rejects.toThrow("parent");
    expect(ledger.entries[0]?.stage).toBe("reserved");
    parent = request.sourceSha;
    await retireStalePreparations(github, store, "e".repeat(40), request.actor, 2);
    expect(ledger.entries[0]).toMatchObject({
      stage: "abandoned",
      prNumber: 4,
      preparationHead: head,
      id: original.entry.id,
    });
  });
  test("retries reuse the original identity before recalculating the baseline", () => {
    const first = reserveRelease(initialLedger(contract), request);
    const retry = reserveRelease(first.ledger, request);
    expect(first.entry.version).toBe("2.8.0");
    expect(retry.reused).toBe(true);
    expect(retry.entry.id).toBe(first.entry.id);
    expect(() => reserveRelease(first.ledger, { ...request, version: "2.9.0" })).toThrow("Retry");
    expect(() => reserveRelease(first.ledger, { ...request, actor: "another" })).toThrow(
      "operator"
    );
    expect(() => reserveRelease(first.ledger, { ...request, sourceSha: "e".repeat(40) })).toThrow(
      "active"
    );
  });
  test("abandonment burns the version and requires a fresh identity", () => {
    const first = reserveRelease(initialLedger(contract), request);
    const abandoned = updateRelease(first.ledger, first.entry.id, { stage: "abandoned" });
    const next = reserveRelease(abandoned, { ...request, preparationRunId: 2 });
    expect(next.entry.version).toBe("2.8.1");
    expect(next.entry.id).not.toBe(first.entry.id);
    expect(() => updateRelease(abandoned, first.entry.id, { stage: "reserved" })).toThrow(
      "revived"
    );
  });
  test("failed merged releases can be abandoned before any artifact is frozen", () => {
    const first = reserveRelease(initialLedger(contract), request);
    let merged = updateRelease(first.ledger, first.entry.id, {
      stage: "pr_open",
      preparationHead: "e".repeat(40),
      prNumber: 4,
    });
    merged = updateRelease(merged, first.entry.id, {
      stage: "merged",
      mergeSha: "f".repeat(40),
      releaseRunId: 7,
      failure: { phase: "merged", runId: "7", attempt: 1 },
    });
    const abandoned = updateRelease(merged, first.entry.id, { stage: "abandoned" });
    expect(abandoned.entries[0]?.stage).toBe("abandoned");
  });
  test("failed merged releases can abandon a frozen input before products exist", () => {
    const first = reserveRelease(initialLedger(contract), request);
    let merged = updateRelease(first.ledger, first.entry.id, {
      stage: "pr_open",
      preparationHead: "e".repeat(40),
      prNumber: 4,
    });
    merged = updateRelease(merged, first.entry.id, {
      stage: "merged",
      mergeSha: "f".repeat(40),
      releaseRunId: 7,
      failure: { phase: "merged", runId: "7", attempt: 1 },
    });
    const input = {
      runId: 7,
      artifactId: 10,
      artifactName: `release-${first.entry.id}-inputs`,
      archiveDigest: `sha256:${"1".repeat(64)}`,
      manifestDigest: "2".repeat(64),
    };
    const frozen = updateRelease(merged, first.entry.id, { inputs: input });
    const abandoned = updateRelease(frozen, first.entry.id, {
      stage: "abandoned",
      inputs: undefined,
    });
    expect(abandoned.entries[0]?.stage).toBe("abandoned");
    expect(abandoned.entries[0]?.inputs).toBeUndefined();
  });
  test("unproven stages and source replacement cannot be committed", () => {
    const first = reserveRelease(initialLedger(contract), request);
    expect(() => updateRelease(first.ledger, first.entry.id, { stage: "published" })).toThrow(
      "skipped"
    );
    expect(() => updateRelease(first.ledger, first.entry.id, { stage: "pr_open" })).toThrow(
      "provenance"
    );
    expect(() =>
      updateRelease(first.ledger, first.entry.id, { sourceSha: "e".repeat(40) })
    ).toThrow("replace sourceSha");
    const changed = structuredClone(first.ledger);
    if (!changed.entries[0]) throw new Error("Missing fixture");
    changed.entries[0].version = "2.9.0";
    expect(() => validateLedger(changed, contract)).toThrow("identity");
  });
  test("simultaneous compare-and-swap writers cannot reserve two identities", async () => {
    let sha = "root";
    let ledger = initialLedger(contract);
    const store: LedgerStore = {
      async read() {
        return { sha, ledger: structuredClone(ledger) };
      },
      async compareAndSwap(expected, next) {
        if (sha !== expected) throw new Error("CAS conflict");
        sha = "next";
        ledger = next;
        return sha;
      },
    };
    const reserve = (actor: string) =>
      changeLedger(store, (current) => {
        const prepared = reserveRelease(current, { ...request, actor });
        return { ledger: prepared.ledger, result: prepared.entry.id };
      });
    const results = await Promise.allSettled([reserve("one"), reserve("two")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(ledger.entries).toHaveLength(1);
  });
});
