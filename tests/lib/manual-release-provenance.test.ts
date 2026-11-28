import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { z } from "zod";
import qualityJson from "../../.github/quality-gates.json";
import contractJson from "../../.github/release-contract.json";
import {
  assertNoFailedEvaluation,
  assertRunSource,
  classifyMergeFollowup,
  evaluationChecksPassed,
  followupPhaseBudgetMessage,
  mainEvaluationResult,
  planMergeFollowup,
  qualitySchema,
} from "../../src/lib/release/completion";
import { GitHubRelease, type GitHubTransport } from "../../src/lib/release/github";
import { contractSchema } from "../../src/lib/release/policy";
import { assertPolicyIdentity, policyIdentity } from "../../src/lib/release/source";

const contract = contractSchema.parse(contractJson);
const quality = qualitySchema.parse(qualityJson);
const sha = "a".repeat(40);
const run = {
  id: 1,
  workflow_id: 2,
  run_attempt: 1,
  head_sha: sha,
  head_branch: "main",
  event: "push",
  status: "completed",
  conclusion: "success",
  path: ".github/workflows/ci.yml",
  head_repository: { full_name: contract.repository },
};
function transport(request: GitHubTransport["request"]): GitHubTransport {
  return {
    request,
    command() {
      throw new Error("Read-only validation must not issue commands");
    },
  };
}

describe("trusted release evaluation", () => {
  test("followup rejects a release identity from a different policy", () => {
    const identity = policyIdentity(contract, quality);
    expect(() => assertPolicyIdentity(contract, quality, identity)).not.toThrow();
    expect(() => assertPolicyIdentity(contract, quality, "0".repeat(64))).toThrow(
      "Release policy changed"
    );
  });

  test("candidate signature probes never execute with a repository write token", () => {
    const workflow = z
      .object({
        jobs: z.object({
          "release-token-probe": z.object({ permissions: z.record(z.string(), z.string()) }),
        }),
      })
      .parse(load(readFileSync(".github/workflows/ci.yml", "utf8")));
    expect(Object.values(workflow.jobs["release-token-probe"].permissions)).not.toContain("write");
  });
  test("accepts exact-main dispatch while rejecting forks, unrelated events and source drift", () => {
    const github = new GitHubRelease(
      contract,
      "github-actions",
      transport(() => null)
    );
    assertRunSource(github, run, sha, run.path);
    assertRunSource(github, { ...run, event: "workflow_dispatch" }, sha, run.path);
    for (const modified of [
      { ...run, event: "repository_dispatch" },
      { ...run, head_branch: "th/candidate" },
      { ...run, head_sha: "b".repeat(40) },
      { ...run, head_repository: { full_name: "fork/blog-26" } },
    ])
      expect(() => assertRunSource(github, modified, sha, run.path)).toThrow("trusted");
  });
  test("merge followup treats an observed merge as authoritative over branch drift", () => {
    const mergeSha = "b".repeat(40);
    expect(
      classifyMergeFollowup(
        { state: "closed", merged: true, merge_commit_sha: mergeSha },
        mergeSha,
        sha
      )
    ).toBe("merged");
    expect(
      classifyMergeFollowup({ state: "open", merged: false, merge_commit_sha: null }, sha, sha)
    ).toBe("pending");
    expect(
      classifyMergeFollowup({ state: "open", merged: false, merge_commit_sha: null }, mergeSha, sha)
    ).toBe("merge_propagating");
    expect(
      classifyMergeFollowup(
        { state: "closed", merged: true, merge_commit_sha: mergeSha },
        "c".repeat(40),
        sha
      )
    ).toBe("source_changed");
    // A merged pull can expose merged=true before the merge commit exists; wait, do not abort.
    expect(
      classifyMergeFollowup(
        { state: "closed", merged: true, merge_commit_sha: null },
        mergeSha,
        sha
      )
    ).toBe("pending");
  });
  test("a recorded failed run settles the gate while its sibling still runs", () => {
    const github = new GitHubRelease(
      contract,
      "github-actions",
      transport((endpoint) => {
        const e2e = endpoint.includes("e2e.yml") || endpoint.includes("/20/");
        if (endpoint.includes("/workflows/") && !endpoint.includes("/runs?"))
          return { id: e2e ? 20 : 2, path: `.github/workflows/${e2e ? "e2e" : "ci"}.yml` };
        if (endpoint.includes("/runs?"))
          return [
            {
              workflow_runs: [
                {
                  ...run,
                  id: e2e ? 200 : 1,
                  workflow_id: e2e ? 20 : 2,
                  path: `.github/workflows/${e2e ? "e2e" : "ci"}.yml`,
                  status: e2e ? "completed" : "in_progress",
                  conclusion: e2e ? "failure" : null,
                },
              ],
            },
          ];
        if (endpoint.includes("/jobs?"))
          return [
            {
              jobs: quality.main_required_checks
                .filter((name) => name.startsWith("Playwright"))
                .map((name) => ({
                  name,
                  head_sha: sha,
                  status: "completed",
                  conclusion: "failure",
                })),
            },
          ];
        throw new Error(`Unexpected read: ${endpoint}`);
      })
    );
    // The aggregate is pending because the sibling CI run has not finished, but the failure is final.
    const result = mainEvaluationResult(github, sha, quality);
    expect(result.state).toBe("pending");
    expect(result.failedRun?.conclusion).toBe("failure");
    expect(() => assertNoFailedEvaluation(result)).toThrow(
      "Required main evaluation failed; retry its original CI run"
    );
  });
  test("a merged preparation resumes at the merge instead of re-attesting its head", () => {
    const mergeSha = "b".repeat(40);
    // The v4.3.2 rerun state: merged onto main, preparation branch already deleted.
    expect(planMergeFollowup({ state: "closed", merged: true, merge_commit_sha: mergeSha })).toBe(
      "observe_merge"
    );
    // Merge seen before main exposes it: still unobservable head, so keep observing.
    expect(planMergeFollowup({ state: "closed", merged: true, merge_commit_sha: null })).toBe(
      "observe_merge"
    );
    // A closed, unmerged preparation must never publish attestations again.
    expect(planMergeFollowup({ state: "closed", merged: false, merge_commit_sha: null })).toBe(
      "observe_merge"
    );
    expect(planMergeFollowup({ state: "open", merged: false, merge_commit_sha: null })).toBe(
      "attest_preparation"
    );
  });
  test("followup budgets report their own phase budget and in-phase time", () => {
    const started = 1_000_000;
    expect(
      followupPhaseBudgetMessage("exact-head evaluation", 20, started, started + 19 * 60_000)
    ).toBeUndefined();
    expect(
      followupPhaseBudgetMessage("main release check", 20, started, started + 20 * 60_000)
    ).toBe("Release followup exceeded its 20-minute main release check budget (1200s in phase)");
    // A long preceding phase must not leak into the reported duration of a later one.
    expect(
      followupPhaseBudgetMessage(
        "main release check",
        20,
        started + 30 * 60_000,
        started + 51 * 60_000
      )
    ).toBe("Release followup exceeded its 20-minute main release check budget (1260s in phase)");
  });
  test("success on another SHA or a skipped required E2E job cannot publish", () => {
    let mode: "success" | "skipped" | "wrong-sha" = "success";
    const github = new GitHubRelease(
      contract,
      "github-actions",
      transport((endpoint) => {
        const e2e =
          endpoint.includes("e2e.yml") || endpoint.includes("/20/") || endpoint.includes("/200/");
        if (endpoint.includes("/workflows/") && !endpoint.includes("/runs?"))
          return { id: e2e ? 20 : 2, path: `.github/workflows/${e2e ? "e2e" : "ci"}.yml` };
        if (endpoint.includes("/runs?"))
          return [
            {
              workflow_runs: [
                {
                  ...run,
                  id: e2e ? 200 : 1,
                  workflow_id: e2e ? 20 : 2,
                  path: `.github/workflows/${e2e ? "e2e" : "ci"}.yml`,
                },
              ],
            },
          ];
        if (endpoint.includes("/jobs?"))
          return [
            {
              jobs: quality.main_required_checks
                .filter((name) => name.startsWith("Playwright") === e2e)
                .map((name) => ({
                  name,
                  head_sha: mode === "wrong-sha" ? "b".repeat(40) : sha,
                  status: "completed",
                  conclusion:
                    mode === "skipped" && name === "Playwright E2E (mcp)" ? "skipped" : "success",
                })),
            },
          ];
        throw new Error(`Unexpected read: ${endpoint}`);
      })
    );
    expect(evaluationChecksPassed(github, sha, quality.main_required_checks, "main")).toBe(true);
    mode = "skipped";
    expect(evaluationChecksPassed(github, sha, quality.main_required_checks, "main")).toBe(false);
    mode = "wrong-sha";
    expect(() => evaluationChecksPassed(github, sha, quality.main_required_checks, "main")).toThrow(
      "different source"
    );
  });
  test("human-authored ledger commits fail closed even when their signature is valid", () => {
    const github = new GitHubRelease(
      contract,
      "github-actions",
      transport(() => {
        return {
          sha,
          author: { login: "owner" },
          committer: { login: "owner" },
          parents: [],
          commit: {
            message: "Signed-off-by: owner <owner@example.com>",
            tree: { sha },
            verification: { verified: true, reason: "valid" },
          },
        };
      })
    );
    expect(() => github.verifyBotCommit(sha)).toThrow("github-actions[bot]");
  });
  test("native signed branch commits enforce expected-head CAS and require verified bot provenance", () => {
    const next = "b".repeat(40);
    let verified = true;
    let parent = sha;
    const writes: { endpoint: string; payload: unknown }[] = [];
    const github = new GitHubRelease(
      contract,
      "github-actions",
      transport((endpoint, method, payload) => {
        if (endpoint.startsWith("users/")) return { id: 41898282 };
        if (method === "POST") {
          writes.push({ endpoint, payload });
          return { data: { createCommitOnBranch: { commit: { oid: next } } } };
        }
        const commit = {
          message:
            "chore(release): prepare\n\nSigned-off-by: github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>",
          tree: { sha },
          verification: { verified, reason: verified ? "valid" : "unsigned" },
        };
        if (endpoint.includes("/git/commits/"))
          return { sha: next, parents: [{ sha: parent }], ...commit };
        return {
          sha: next,
          author: { login: "github-actions[bot]" },
          committer: { login: "web-flow" },
          parents: [{ sha: parent }],
          commit,
        };
      })
    );
    expect(
      github.createCommitOnBranch(
        "th/release-test",
        sha,
        [{ path: "VERSION", content: "2.8.0\n" }],
        "chore(release): prepare"
      )
    ).toBe(next);
    expect(writes[0]).toMatchObject({
      endpoint: "graphql",
      payload: {
        variables: {
          input: {
            expectedHeadOid: sha,
            branch: { repositoryNameWithOwner: contract.repository, branchName: "th/release-test" },
          },
        },
      },
    });
    parent = next;
    expect(() =>
      github.createCommitOnBranch("th/release-test", sha, [], "chore(release): prepare")
    ).toThrow("parent");
    parent = sha;
    verified = false;
    const fresh = new GitHubRelease(contract, "github-actions", github.transport);
    expect(() =>
      fresh.createCommitOnBranch("th/release-test", sha, [], "chore(release): prepare")
    ).toThrow("Verified");
  });
  test("explicit evaluation dispatch is idempotent and source drift prevents new runs", () => {
    let head = sha;
    let exists = false;
    let dispatches = 0;
    const github = new GitHubRelease(
      contract,
      "github-actions",
      transport((endpoint, method) => {
        if (endpoint.includes("/git/ref/")) return { object: { sha: head, type: "commit" } };
        if (method === "POST") {
          dispatches++;
          return null;
        }
        return [
          {
            workflow_runs: exists
              ? [{ event: "workflow_dispatch", head_sha: sha, head_branch: "main" }]
              : [],
          },
        ];
      })
    );
    github.dispatchEvaluation("ci.yml", "main", sha);
    expect(dispatches).toBe(1);
    exists = true;
    github.dispatchEvaluation("ci.yml", "main", sha);
    expect(dispatches).toBe(1);
    head = "b".repeat(40);
    expect(() => github.dispatchEvaluation("e2e.yml", "main", sha)).toThrow("source moved");
    expect(dispatches).toBe(1);
  });

  test("dispatches a release followup with the registered identity and exact head", () => {
    const writes: { endpoint: string; payload: unknown }[] = [];
    const github = new GitHubRelease(
      contract,
      "github-actions",
      transport((endpoint, method, payload) => {
        if (method === "POST") {
          writes.push({ endpoint, payload });
          return null;
        }
        throw new Error(`Unexpected read ${endpoint}`);
      })
    );
    github.dispatchReleaseFollowup("release-id", 42, sha);
    expect(writes).toEqual([
      {
        endpoint: "repos/IvanLi-CN/blog-26/actions/workflows/release-merge-followup.yml/dispatches",
        payload: {
          ref: "main",
          inputs: { release_id: "release-id", pr_number: "42", head_sha: sha },
        },
      },
    ]);
  });

  test("dispatches the product release that a generated evaluation cannot chain into", () => {
    const writes: { endpoint: string; payload: unknown }[] = [];
    const github = new GitHubRelease(
      contract,
      "github-actions",
      transport((endpoint, method, payload) => {
        if (method === "POST") {
          writes.push({ endpoint, payload });
          return null;
        }
        if (endpoint.includes("product-release.yml/runs?")) return [{ workflow_runs: [] }];
        throw new Error(`Unexpected read ${endpoint}`);
      })
    );
    github.dispatchProductRelease(sha);
    expect(writes).toEqual([
      {
        endpoint: "repos/IvanLi-CN/blog-26/actions/workflows/product-release.yml/dispatches",
        payload: { ref: "main" },
      },
    ]);
  });

  test("a rerun does not queue a second product release for the same merge", () => {
    const writes: { endpoint: string; payload: unknown }[] = [];
    const github = new GitHubRelease(
      contract,
      "github-actions",
      transport((endpoint, method, payload) => {
        if (method === "POST") {
          writes.push({ endpoint, payload });
          return null;
        }
        if (endpoint.includes("product-release.yml/runs?"))
          return [
            {
              workflow_runs: [
                { id: 4_612_000_001, head_sha: sha, event: "workflow_dispatch" },
                { id: 4_611_000_002, head_sha: "c".repeat(40), event: "workflow_dispatch" },
              ],
            },
          ];
        throw new Error(`Unexpected read ${endpoint}`);
      })
    );
    // The reused run is the one already at this merge SHA, never a run queued for another head.
    expect(github.dispatchProductRelease(sha)).toBe(4_612_000_001);
    expect(writes).toEqual([]);
  });
  test("publishes exact-head release checks idempotently through the Actions app", () => {
    const writes: { endpoint: string; payload: unknown }[] = [];
    const runs: unknown[] = [];
    const github = new GitHubRelease(
      contract,
      "github-actions",
      transport((endpoint, method, payload) => {
        if (endpoint.includes("/check-runs?")) return [{ check_runs: runs }];
        if (method === "POST" && endpoint.endsWith("/check-runs")) {
          writes.push({ endpoint, payload });
          const body = payload as { name: string; external_id: string };
          runs.push({
            id: runs.length + 1,
            name: body.name,
            status: "completed",
            conclusion: "success",
            external_id: body.external_id,
            app: { slug: "github-actions" },
          });
          return { id: runs.length };
        }
        throw new Error(`Unexpected write ${method} ${endpoint}`);
      })
    );
    github.publishReleaseChecks("release-id", sha, 42, ["Lint", "Build"]);
    github.publishReleaseChecks("release-id", sha, 42, ["Lint", "Build"]);
    expect(writes).toHaveLength(2);
    expect(writes[0]?.payload).toMatchObject({
      name: "Lint",
      head_sha: sha,
      external_id: "release/release-id/Lint",
      conclusion: "success",
      details_url: "https://github.com/IvanLi-CN/blog-26/pull/42",
    });
  });
});
