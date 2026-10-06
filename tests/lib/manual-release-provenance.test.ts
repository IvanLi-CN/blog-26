import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { z } from "zod";
import qualityJson from "../../.github/quality-gates.json";
import contractJson from "../../.github/release-contract.json";
import { assertRunSource, mainChecksPassed, qualitySchema } from "../../src/lib/release/completion";
import { GitHubRelease, type GitHubTransport } from "../../src/lib/release/github";
import { contractSchema } from "../../src/lib/release/policy";

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
    expect(mainChecksPassed(github, sha, quality)).toBe(true);
    mode = "skipped";
    expect(mainChecksPassed(github, sha, quality)).toBe(false);
    mode = "wrong-sha";
    expect(() => mainChecksPassed(github, sha, quality)).toThrow("different source");
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
});
