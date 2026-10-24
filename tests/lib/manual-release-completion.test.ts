import { describe, expect, test } from "bun:test";
import contractJson from "../../.github/release-contract.json";
import {
  assertReleaseRecoverySource,
  assertRetryableProductRelease,
  manualRecoveryRunCanTakeOver,
  manualReleaseWorkflowRun,
  productReleaseWorkflowPath,
  releaseRecoveryEventSchema,
} from "../../src/lib/release/completion";
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
  test("release cleanup accepts both workflow-triggered run event types", () => {
    expect(releaseRecoveryEventSchema.parse("workflow_run")).toBe("workflow_run");
    expect(releaseRecoveryEventSchema.parse("workflow_dispatch")).toBe("workflow_dispatch");
  });

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

  test("allows a new manual run to take over an unfrozen failed manual run", () => {
    const current = fixture([4]);
    const merged = updateRelease(current, current.entries[0]?.id || "", {
      stage: "merged",
      mergeSha,
      releaseRunId: 98,
      failure: { phase: "merged", runId: "98", attempt: 2 },
    }).entries[0];
    if (!merged) throw new Error("Missing merged fixture");
    expect(
      manualRecoveryRunCanTakeOver(
        merged,
        {
          id: 98,
          workflow_id: 123,
          run_attempt: 2,
          head_sha: "d".repeat(40),
          head_branch: "main",
          event: "workflow_dispatch",
          status: "completed",
          conclusion: "failure",
          path: ".github/workflows/product-release.yml",
          head_repository: { full_name: contract.repository },
        },
        contract.repository
      )
    ).toBe(true);
  });

  test("does not allow a new manual run to take over frozen inputs", () => {
    const current = fixture([4]);
    const merged = updateRelease(current, current.entries[0]?.id || "", {
      stage: "merged",
      mergeSha,
      releaseRunId: 98,
      failure: { phase: "preflight_media", runId: "98", attempt: 1 },
    }).entries[0];
    if (!merged) throw new Error("Missing merged fixture");
    const withInputs = updateRelease(
      merged ? { ...current, entries: [merged] } : current,
      merged.id,
      {
        inputs: {
          runId: 98,
          artifactId: 10,
          artifactName: `release-${merged.id}-inputs`,
          manifestDigest: "d".repeat(64),
          archiveDigest: `sha256:${"e".repeat(64)}`,
        },
      }
    ).entries[0];
    if (!withInputs) throw new Error("Missing frozen fixture");
    expect(
      manualRecoveryRunCanTakeOver(
        withInputs,
        {
          id: 98,
          workflow_id: 123,
          run_attempt: 1,
          head_sha: mergeSha,
          head_branch: "main",
          event: "workflow_dispatch",
          status: "completed",
          conclusion: "failure",
          path: productReleaseWorkflowPath,
          head_repository: { full_name: contract.repository },
        },
        contract.repository
      )
    ).toBe(false);
  });

  test("validates retry against the original run identity and merge source", () => {
    const current = fixture([4]);
    const entry = updateRelease(current, current.entries[0]?.id || "", {
      stage: "merged",
      mergeSha,
      releaseRunId: 98,
      failure: {
        phase: "preflight_media",
        step: "Preflight frozen media closure",
        runId: "98",
        attempt: 2,
      },
    }).entries[0];
    if (!entry) throw new Error("Missing retry fixture");
    expect(() =>
      assertRetryableProductRelease(
        entry,
        {
          id: 98,
          workflow_id: 123,
          run_attempt: 2,
          head_sha: mergeSha,
          head_branch: "main",
          event: "workflow_run",
          status: "completed",
          conclusion: "failure",
          path: productReleaseWorkflowPath,
          head_repository: { full_name: contract.repository },
        },
        contract.repository
      )
    ).not.toThrow();
    expect(() =>
      assertRetryableProductRelease(
        entry,
        {
          id: 98,
          workflow_id: 123,
          run_attempt: 2,
          head_sha: "d".repeat(40),
          head_branch: "main",
          event: "workflow_dispatch",
          status: "completed",
          conclusion: "failure",
          path: productReleaseWorkflowPath,
          head_repository: { full_name: contract.repository },
        },
        contract.repository
      )
    ).not.toThrow();
    expect(() =>
      assertRetryableProductRelease(
        entry,
        {
          id: 99,
          workflow_id: 123,
          run_attempt: 2,
          head_sha: mergeSha,
          head_branch: "main",
          event: "workflow_run",
          status: "completed",
          conclusion: "failure",
          path: productReleaseWorkflowPath,
          head_repository: { full_name: contract.repository },
        },
        contract.repository
      )
    ).toThrow("original release run");
  });

  test("accepts a later main head for a manual recovery dispatch", () => {
    const current = fixture([4]);
    const entry = updateRelease(current, current.entries[0]?.id || "", {
      stage: "merged",
      mergeSha,
      releaseRunId: 98,
    }).entries[0];
    if (!entry) throw new Error("Missing recovery fixture");
    expect(() =>
      assertReleaseRecoverySource(entry, {
        id: 98,
        workflow_id: 123,
        run_attempt: 1,
        head_sha: "d".repeat(40),
        head_branch: "main",
        event: "workflow_dispatch",
        status: "completed",
        conclusion: "failure",
        path: productReleaseWorkflowPath,
        head_repository: { full_name: contract.repository },
      })
    ).not.toThrow();
    expect(() =>
      assertReleaseRecoverySource(entry, {
        id: 98,
        workflow_id: 123,
        run_attempt: 1,
        head_sha: "d".repeat(40),
        head_branch: "main",
        event: "workflow_run",
        status: "completed",
        conclusion: "failure",
        path: productReleaseWorkflowPath,
        head_repository: { full_name: contract.repository },
      })
    ).toThrow("Failed release source identity changed");
  });

  test("reruns the original GitHub Actions run without dispatching a successor", () => {
    let request: { endpoint: string; method: string } | undefined;
    const app = new GitHubRelease(contract, "github-actions", {
      request(endpoint, method = "GET") {
        request = { endpoint, method };
        return null;
      },
      command() {
        throw new Error("Rerun validation must use the GitHub API");
      },
    });
    app.rerunWorkflowRun(98);
    expect(request).toEqual({
      endpoint: `${app.root}/actions/runs/98/rerun`,
      method: "POST",
    });
  });
});
