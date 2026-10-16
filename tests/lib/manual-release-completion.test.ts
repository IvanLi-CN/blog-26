import { describe, expect, test } from "bun:test";
import contractJson from "../../.github/release-contract.json";
import { manualReleaseWorkflowRun } from "../../src/lib/release/completion";
import { GitHubRelease } from "../../src/lib/release/github";
import { initialLedger, reserveRelease, updateRelease } from "../../src/lib/release/ledger";
import { contractSchema } from "../../src/lib/release/policy";

const contract = contractSchema.parse(contractJson);
const sourceSha = "a".repeat(40);
const preparationHead = "b".repeat(40);
const mergeSha = "c".repeat(40);

function pull(number: number, sha = mergeSha) {
  return {
    number,
    node_id: `PR_${number}`,
    state: "closed" as const,
    merged: true,
    merge_commit_sha: sha,
    user: { login: "github-actions[bot]" },
    head: {
      sha: preparationHead,
      ref: "th/release-fixture",
      repo: { full_name: contract.repository },
    },
    base: { ref: "main", repo: { full_name: contract.repository } },
    auto_merge: null,
  };
}

function fixture(numbers: number[]) {
  const entries = numbers.map((number) => {
    const reserved = reserveRelease(initialLedger(contract), {
      sourceSha,
      policyDigest: String(number).repeat(64),
      evidenceDigest: String(number + 1).repeat(64),
      actor: "owner",
      impact: "patch",
      preparationRunId: number,
      version: `2.7.${number}`,
    });
    return updateRelease(reserved.ledger, reserved.entry.id, {
      stage: "pr_open",
      preparationHead,
      prNumber: number,
    }).entries[0];
  });
  return { ...initialLedger(contract), entries };
}

function githubFor(numbers: number[]) {
  return new GitHubRelease(contract, "github-actions", {
    request(endpoint) {
      const match = endpoint.match(/\/pulls\/(\d+)$/);
      if (!match) throw new Error(`Unexpected endpoint ${endpoint}`);
      const number = Number(match[1]);
      if (!numbers.includes(number)) throw new Error(`Unexpected pull ${number}`);
      return pull(number);
    },
    command() {
      throw new Error("Manual release run resolution must not issue commands");
    },
  });
}

describe("manual product release resolution", () => {
  test("binds the one merged registered identity to a synthetic workflow run", () => {
    const run = manualReleaseWorkflowRun(githubFor([4]), fixture([4]), 99);
    expect(run).toMatchObject({
      id: 99,
      head_sha: mergeSha,
      head_branch: "main",
      event: "workflow_dispatch",
      path: ".github/workflows/ci.yml",
    });
  });

  test("fails closed when more than one active identity is already merged", () => {
    expect(() => manualReleaseWorkflowRun(githubFor([4, 5]), fixture([4, 5]), 99)).toThrow(
      "exactly one active merged identity"
    );
  });
});
