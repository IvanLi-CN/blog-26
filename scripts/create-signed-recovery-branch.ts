import { readFile } from "node:fs/promises";

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN;
const branch = process.env.TARGET_BRANCH;
const baseSha = process.env.BASE_SHA;
if (!repository || !token || !branch || !baseSha) throw new Error("Missing recovery branch inputs");

const files = [
  ".github/workflows/recover-published-release.yml",
  ".github/workflows/enable-recovery-auto-merge.yml",
  "scripts/recover-published-release.ts",
  "docs/version-impact/recover-published-release.json",
];
const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
async function github(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

try {
  await github(`/repos/${repository}/git/refs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
  });
} catch (error) {
  if (!String(error).includes("Reference already exists")) throw error;
}

const additions = await Promise.all(
  files.map(async (path) => ({
    path,
    contents: Buffer.from(await readFile(path)).toString("base64"),
  }))
);
const response = await github("/graphql", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query:
      "mutation($input:CreateCommitOnBranchInput!){createCommitOnBranch(input:$input){commit{oid}}}",
    variables: {
      input: {
        branch: { repositoryNameWithOwner: repository, branchName: branch },
        expectedHeadOid: baseSha,
        message: {
          headline: "chore(release): recover published v2.13.0",
          body: "Identity-bound recovery path for the already-published v2.13.0 artifacts.\n\nSigned-off-by: github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>",
        },
        fileChanges: { additions },
      },
    },
  }),
});
if (response.errors?.length || !response.data?.createCommitOnBranch?.commit?.oid)
  throw new Error(JSON.stringify(response));
console.log(`Created verified recovery commit ${response.data.createCommitOnBranch.commit.oid}`);
