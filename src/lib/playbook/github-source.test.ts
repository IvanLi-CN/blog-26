import { describe, expect, test } from "bun:test";
import { publicFixtureCatalog, publicFixtureSearch } from "./fixture";
import {
  comparePlaybookSnapshots,
  createPlaybookGitHubExportManifest,
  createPlaybookGitHubSourceTransport,
  loadPlaybookGitHubSnapshot,
  normalizePlaybookSnapshot,
  PLAYBOOK_GITHUB_PUBLIC_ALLOWLIST,
  type PlaybookGitHubSourceConfig,
  type PlaybookGitHubSourceTransport,
  readPlaybookGitHubSnapshot,
  readPlaybookGitHubSourceConfig,
} from "./github-source";
import { computePlaybookContentHash, encodeJson, fileRecord } from "./manifest";
import type { PlaybookGitHubSnapshot, PlaybookSearchPayload } from "./types";

const commit = "a".repeat(40);
const nextCommit = "b".repeat(40);

const completeFixtureSearch: PlaybookSearchPayload = {
  ...publicFixtureSearch,
  documents: [
    ...publicFixtureSearch.documents,
    {
      id: "section:recovery",
      kind: "section",
      title: "失败与恢复",
      subtitle: "可靠交付",
      body: "断网时继续提供已经验证的内容，恢复后整体切换新版本。",
      route: "/topics/delivery",
      section_id: "recovery",
      keywords: ["恢复"],
      command_id: null,
    },
    {
      id: "section:architecture",
      kind: "section",
      title: "架构与选择",
      subtitle: "Sample Project 实践快照",
      body: "以 Astro 提供静态阅读，用固定的内容版本保持可重复构建。",
      route: "/projects/sample-project",
      section_id: "architecture",
      keywords: ["Astro"],
      command_id: null,
    },
    {
      id: "section:resources",
      kind: "section",
      title: "公开资源",
      subtitle: "Safe Release",
      body: "公开资源文件。",
      route: "/policies/safe-release",
      section_id: "resources",
      keywords: ["资源"],
      command_id: null,
    },
  ],
};

function makeFixtureFiles(catalog = publicFixtureCatalog, search = completeFixtureSearch) {
  const normalized = normalizePlaybookSnapshot(catalog, search);
  const catalogBytes = Buffer.from(encodeJson(normalized.catalog));
  const searchBytes = Buffer.from(encodeJson(normalized.search));
  const manifest = createPlaybookGitHubExportManifest(normalized.catalog, normalized.search);
  return new Map<string, Uint8Array>([
    [PLAYBOOK_GITHUB_PUBLIC_ALLOWLIST[0], Buffer.from(encodeJson(manifest))],
    [PLAYBOOK_GITHUB_PUBLIC_ALLOWLIST[1], catalogBytes],
    [PLAYBOOK_GITHUB_PUBLIC_ALLOWLIST[2], searchBytes],
  ]);
}

function makeTransport(
  files: ReadonlyMap<string, Uint8Array>,
  resolvedCommit = commit,
  calls: string[] = []
): PlaybookGitHubSourceTransport {
  return {
    async resolveRef(input) {
      calls.push(`resolve:${input.repository}:${input.ref}`);
      return resolvedCommit;
    },
    async readFile(input) {
      calls.push(`read:${input.commit}:${input.path}`);
      const bytes = files.get(input.path);
      if (!bytes) throw new Error(`fixture is missing ${input.path}`);
      return bytes;
    },
  };
}

const config: PlaybookGitHubSourceConfig = {
  repository: "IvanLi-CN/style-playbook-skills",
  ref: "main",
  token: "fixture-token",
};

test("reconstructs one complete snapshot from one fixed commit and never calls the static site", async () => {
  const calls: string[] = [];
  const snapshot = await readPlaybookGitHubSnapshot(
    makeTransport(makeFixtureFiles(), commit, calls),
    config
  );

  expect(snapshot.sourceRevision).toEqual({
    provider: "github",
    repository: config.repository,
    ref: config.ref,
    commit,
  });
  expect(snapshot.catalog).toEqual(publicFixtureCatalog);
  expect(snapshot.search.documents.some((document) => document.id.startsWith("policy:"))).toBe(
    true
  );
  expect(calls).toEqual([
    "resolve:IvanLi-CN/style-playbook-skills:main",
    ...PLAYBOOK_GITHUB_PUBLIC_ALLOWLIST.map((path) => `read:${commit}:${path}`),
  ]);
  expect(calls.some((call) => call.includes("ivanli.cc") || call.includes("static"))).toBe(false);
});

test("classifies commit and content identity changes without rebuilding unchanged projections", () => {
  const base: PlaybookGitHubSnapshot = {
    sourceRevision: { provider: "github", repository: config.repository, ref: "main", commit },
    catalog: publicFixtureCatalog,
    search: publicFixtureSearch,
    contentHash: "1".repeat(64),
  };
  const sameHashNewCommit = {
    ...base,
    sourceRevision: { ...base.sourceRevision, commit: nextCommit },
  };
  const differentHashSameCommit = { ...base, contentHash: "2".repeat(64) };
  const differentHashNewCommit = {
    ...sameHashNewCommit,
    contentHash: "3".repeat(64),
  };

  expect(comparePlaybookSnapshots(base, base)).toEqual({
    status: "current",
    sourceChanged: false,
    contentChanged: false,
    updateProvenance: false,
    rebuildContent: false,
    rebuildKeywordProjection: false,
  });
  expect(comparePlaybookSnapshots(differentHashSameCommit, base)).toMatchObject({
    status: "stale",
    sourceChanged: false,
    contentChanged: true,
    updateProvenance: false,
    rebuildContent: true,
    rebuildKeywordProjection: true,
  });
  expect(comparePlaybookSnapshots(sameHashNewCommit, base)).toMatchObject({
    status: "stale",
    sourceChanged: true,
    contentChanged: false,
    updateProvenance: true,
    rebuildContent: false,
    rebuildKeywordProjection: false,
  });
  expect(comparePlaybookSnapshots(differentHashNewCommit, base)).toMatchObject({
    status: "stale",
    sourceChanged: true,
    contentChanged: true,
    updateProvenance: true,
    rebuildContent: true,
    rebuildKeywordProjection: true,
  });

  const timestampOnly = {
    catalog: {
      ...base.catalog,
      snapshot: {
        ...base.catalog.snapshot,
        index: { ...base.catalog.snapshot.index, generated_at: "2027-01-01T00:00:00Z" },
      },
    },
    search: { ...base.search, generated_at: "2027-01-01T00:00:00Z" },
  };
  expect(computePlaybookContentHash(timestampOnly)).toBe(computePlaybookContentHash(base));

  const malformed = {
    sourceRevision: { provider: "github" as const, repository: "bad", ref: "bad", commit: "bad" },
    contentHash: "bad",
  };
  expect(() => comparePlaybookSnapshots(malformed, malformed)).toThrow();
});

test("reports malformed digest and public-boundary failures as invalid candidates", async () => {
  const files = makeFixtureFiles();
  const manifestBytes = files.get(PLAYBOOK_GITHUB_PUBLIC_ALLOWLIST[0]);
  if (!manifestBytes) throw new Error("fixture manifest is missing");
  const manifest = JSON.parse(Buffer.from(manifestBytes).toString("utf8")) as {
    contentHash: string;
  };
  manifest.contentHash = "malformed-digest";
  files.set(PLAYBOOK_GITHUB_PUBLIC_ALLOWLIST[0], Buffer.from(encodeJson(manifest)));
  const digestResult = await loadPlaybookGitHubSnapshot(makeTransport(files), config);
  expect(digestResult.status).toBe("invalid");

  const mismatchedFiles = makeFixtureFiles();
  const mismatchedManifestBytes = mismatchedFiles.get(PLAYBOOK_GITHUB_PUBLIC_ALLOWLIST[0]);
  if (!mismatchedManifestBytes) throw new Error("fixture manifest is missing");
  const mismatchedManifest = JSON.parse(Buffer.from(mismatchedManifestBytes).toString("utf8")) as {
    files: [
      { path: string; sha256: string; size: number },
      { path: string; sha256: string; size: number },
    ];
  };
  mismatchedManifest.files[0].sha256 = "0".repeat(64);
  mismatchedFiles.set(
    PLAYBOOK_GITHUB_PUBLIC_ALLOWLIST[0],
    Buffer.from(encodeJson(mismatchedManifest))
  );
  const mismatchResult = await loadPlaybookGitHubSnapshot(makeTransport(mismatchedFiles), config);
  expect(mismatchResult.status).toBe("invalid");

  const nonCanonicalFiles = makeFixtureFiles();
  const canonicalCatalogBytes = nonCanonicalFiles.get(PLAYBOOK_GITHUB_PUBLIC_ALLOWLIST[1]);
  const nonCanonicalManifestBytes = nonCanonicalFiles.get(PLAYBOOK_GITHUB_PUBLIC_ALLOWLIST[0]);
  if (!canonicalCatalogBytes || !nonCanonicalManifestBytes)
    throw new Error("fixture export is incomplete");
  const nonCanonicalCatalogBytes = Buffer.from(
    JSON.stringify(JSON.parse(Buffer.from(canonicalCatalogBytes).toString("utf8")))
  );
  nonCanonicalFiles.set(PLAYBOOK_GITHUB_PUBLIC_ALLOWLIST[1], nonCanonicalCatalogBytes);
  const nonCanonicalManifest = JSON.parse(
    Buffer.from(nonCanonicalManifestBytes).toString("utf8")
  ) as {
    files: [
      { path: string; sha256: string; size: number },
      { path: string; sha256: string; size: number },
    ];
  };
  nonCanonicalManifest.files[0] = fileRecord("catalog.json", nonCanonicalCatalogBytes);
  nonCanonicalFiles.set(
    PLAYBOOK_GITHUB_PUBLIC_ALLOWLIST[0],
    Buffer.from(encodeJson(nonCanonicalManifest))
  );
  const nonCanonicalResult = await loadPlaybookGitHubSnapshot(
    makeTransport(nonCanonicalFiles),
    config
  );
  expect(nonCanonicalResult.status).toBe("invalid");

  const invalidCatalog = structuredClone(publicFixtureCatalog);
  const topic = invalidCatalog.topic_details[0];
  const policy = topic?.policy_skills[0];
  if (!policy) throw new Error("fixture policy is missing");
  policy.frontmatter = { token: "must-not-leak" };
  const boundaryFiles = makeFixtureFiles();
  const invalidCatalogBytes = Buffer.from(encodeJson(invalidCatalog));
  boundaryFiles.set(PLAYBOOK_GITHUB_PUBLIC_ALLOWLIST[1], invalidCatalogBytes);
  const boundaryManifestBytes = boundaryFiles.get(PLAYBOOK_GITHUB_PUBLIC_ALLOWLIST[0]);
  if (!boundaryManifestBytes) throw new Error("fixture manifest is missing");
  const boundaryManifest = JSON.parse(Buffer.from(boundaryManifestBytes).toString("utf8")) as {
    files: [
      { path: string; sha256: string; size: number },
      { path: string; sha256: string; size: number },
    ];
  };
  boundaryManifest.files[0] = fileRecord("catalog.json", invalidCatalogBytes);
  boundaryFiles.set(PLAYBOOK_GITHUB_PUBLIC_ALLOWLIST[0], Buffer.from(encodeJson(boundaryManifest)));
  const boundaryResult = await loadPlaybookGitHubSnapshot(makeTransport(boundaryFiles), config);
  expect(boundaryResult.status).toBe("invalid");
});

test("rejects an incomplete lexical projection before a source can be adopted", () => {
  expect(() => normalizePlaybookSnapshot(publicFixtureCatalog, publicFixtureSearch)).toThrow(
    "Search is missing"
  );
});

describe("source result states", () => {
  test("reads the server-only source configuration with stable defaults", () => {
    expect(readPlaybookGitHubSourceConfig({})).toEqual({
      repository: "IvanLi-CN/style-playbook-skills",
      ref: "main",
      token: null,
    });
    expect(
      readPlaybookGitHubSourceConfig({
        STYLE_PLAYBOOK_GITHUB_REPOSITORY: " org/repo ",
        STYLE_PLAYBOOK_GITHUB_REF: " feature/ref ",
        STYLE_PLAYBOOK_GITHUB_TOKEN: " token ",
      })
    ).toEqual({ repository: "org/repo", ref: "feature/ref", token: "token" });
    expect(() =>
      readPlaybookGitHubSourceConfig({ STYLE_PLAYBOOK_GITHUB_REPOSITORY: "invalid" })
    ).toThrow();
  });

  test("keeps a missing token unconfigured without attempting a GitHub read", async () => {
    const result = await loadPlaybookGitHubSnapshot(makeTransport(makeFixtureFiles()), {
      ...config,
      token: null,
    });
    expect(result).toEqual({
      status: "unconfigured",
      repository: config.repository,
      ref: config.ref,
    });
  });

  test("maps transport failures to failed without weakening the snapshot contract", async () => {
    const transport: PlaybookGitHubSourceTransport = {
      async resolveRef() {
        throw new Error("network unavailable");
      },
      async readFile() {
        throw new Error("unreachable");
      },
    };
    const result = await loadPlaybookGitHubSnapshot(transport, config);
    expect(result).toMatchObject({
      status: "failed",
      repository: config.repository,
      ref: config.ref,
    });
  });
});

test("pins the production transport to GitHub API paths and validates response bytes", async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init: init ?? {} });
    if (requests.length === 1)
      return new Response(JSON.stringify({ sha: commit }), { status: 200 });
    return new Response(
      JSON.stringify({
        type: "file",
        path: "public/playbook/catalog.json",
        content: Buffer.from("fixture\n").toString("base64"),
      }),
      { status: 200 }
    );
  }) as unknown as typeof fetch;
  const transport = createPlaybookGitHubSourceTransport("fixture-token", fetchImpl);

  expect(await transport.resolveRef({ repository: config.repository, ref: config.ref })).toBe(
    commit
  );
  expect(
    await transport.readFile({
      repository: config.repository,
      commit,
      path: "public/playbook/catalog.json",
    })
  ).toEqual(Buffer.from("fixture\n"));
  expect(requests.map((request) => request.url)).toEqual([
    "https://api.github.com/repos/IvanLi-CN/style-playbook-skills/commits/main",
    "https://api.github.com/repos/IvanLi-CN/style-playbook-skills/contents/public/playbook/catalog.json?ref=" +
      commit,
  ]);
  expect(requests[0]?.init).toEqual({
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer fixture-token",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    redirect: "error",
  });
});
