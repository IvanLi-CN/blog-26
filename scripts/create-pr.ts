import { execSync } from "node:child_process";

type RepoInfo = { owner: string; repo: string };

function getRepoFromRemote(): RepoInfo {
  // Examples:
  // ssh://gitea@git.example.com:7022/Owner/repo.git
  // https://git.example.com/Owner/repo.git
  const remote = execSync("git remote get-url origin", { encoding: "utf8" }).trim();
  const m = remote.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) throw new Error(`Cannot parse repo from remote: ${remote}`);
  return { owner: m[1], repo: m[2] };
}

function getCurrentBranch(): string {
  return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
}

async function main() {
  const baseUrl = process.env.GITEA_BASE_URL || "https://git.ivanli.cc";
  const token = process.env.GITEA_TOKEN;
  if (!token) {
    console.error("GITEA_TOKEN is required. Create one in your Gitea profile with repo scope.");
    process.exit(1);
  }

  const { owner, repo } = getRepoFromRemote();
  const head = process.env.PR_HEAD || getCurrentBranch();
  const base = process.env.PR_BASE || "main";
  const title = process.env.PR_TITLE || "feat(rss): add feeds, caching and SEO alternates";
  const body =
    process.env.PR_BODY ||
    `Implement RSS v1: reusable feed builder, /feed.xml, /tags/[tag]/feed.xml, /memos/feed.xml with ETag/Last-Modified, plus /rss.xml redirect and multi-format (/atom.xml, /feed.json).\n\n- Add unit & e2e tests\n- Wire site-level and channel-level alternates\n- Update docs and README (Subscribe)\n\nVerification: dev server on 25090; curl twice shows 304 for If-None-Match.`;

  const api = `${baseUrl.replace(/\/$/, "")}/api/v1/repos/${owner}/${repo}/pulls`;

  const payload = {
    base,
    head,
    title,
    body,
    draft: false,
  };

  const res = await fetch(api, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `token ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create PR failed: ${res.status} ${res.statusText}\n${text}`);
  }

  const json = (await res.json()) as any;
  console.log(`✅ PR created: ${json.html_url || json.url}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
