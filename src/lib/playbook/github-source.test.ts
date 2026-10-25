import { describe, expect, test } from "bun:test";
import { publicFixtureCatalog, publicFixtureSearch } from "./fixture";
import {
  comparePlaybookSnapshots,
  createPlaybookGitHubExportManifest,
  loadPlaybookGitHubSnapshot,
  PLAYBOOK_GITHUB_PUBLIC_ALLOWLIST,
  type PlaybookGitHubSourceConfig,
  type PlaybookGitHubSourceTransport,
  readPlaybookGitHubSnapshot,
} from "./github-source";
import { encodeJson, fileRecord } from "./manifest";
import type { PlaybookGitHubSnapshot } from "./types";

const commit = "a".repeat(40);
const nextCommit = "b".repeat(40);

function makeFixtureFiles(catalog = publicFixtureCatalog, search = publicFixtureSearch) {
  const catalogBytes = Buffer.from(encodeJson(catalog));
  const searchBytes = Buffer.from(encodeJson(search));
  const manifest = createPlaybookGitHubExportManifest(
    catalog,
    search,
    catalogBytes.toString("utf8"),
    searchBytes.toString("utf8")
  );
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

describe("source result states", () => {
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
