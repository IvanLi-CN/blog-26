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

const fixtureTopic = publicFixtureCatalog.topic_details[0];
const fixtureProject = publicFixtureCatalog.project_details[0];
const fixturePolicy = fixtureTopic?.policy_skills[0];
if (!fixtureTopic || !fixtureProject || !fixturePolicy) throw new Error("fixture is incomplete");

const topicBody = [
  fixtureTopic.item.description ?? "",
  ...fixtureTopic.sections.map((section) => section.markdown),
].join(" ");
const projectBody = [
  fixtureProject.item.description ?? "",
  ...fixtureProject.sections.map((section) => section.markdown),
].join(" ");

const completeFixtureSearch: PlaybookSearchPayload = {
  generated_at: publicFixtureSearch.generated_at,
  documents: [
    {
      id: `topic:${fixtureTopic.item.slug}`,
      kind: "page",
      title: fixtureTopic.item.token,
      subtitle: "实践主题",
      body: topicBody,
      route: `/topics/${fixtureTopic.item.slug}`,
      section_id: null,
      keywords: fixtureTopic.item.categories,
      command_id: null,
    },
    ...fixtureTopic.sections.map((section) => ({
      id: `section:topic:${fixtureTopic.item.slug}:${section.id}`,
      kind: "section" as const,
      title: section.title,
      subtitle: fixtureTopic.item.token,
      body: section.markdown,
      route: `/topics/${fixtureTopic.item.slug}`,
      section_id: section.id,
      keywords: fixtureTopic.item.categories,
      command_id: null,
    })),
    {
      id: `project:${fixtureProject.item.slug}`,
      kind: "page",
      title: fixtureProject.title,
      subtitle: "项目实践",
      body: projectBody,
      route: `/projects/${fixtureProject.item.slug}`,
      section_id: null,
      keywords: fixtureProject.item.tags,
      command_id: null,
    },
    ...fixtureProject.sections.map((section) => ({
      id: `section:project:${fixtureProject.item.slug}:${section.id}`,
      kind: "section" as const,
      title: section.title,
      subtitle: fixtureProject.title,
      body: section.markdown,
      route: `/projects/${fixtureProject.item.slug}`,
      section_id: section.id,
      keywords: fixtureProject.item.tags,
      command_id: null,
    })),
    {
      id: `policy:${fixturePolicy.summary.slug}`,
      kind: "page",
      title: fixturePolicy.summary.name,
      subtitle: fixturePolicy.summary.description,
      body: fixturePolicy.instruction_markdown,
      route: `/policies/${fixturePolicy.summary.slug}`,
      section_id: null,
      keywords: [fixturePolicy.summary.slug, fixturePolicy.summary.primary_topic],
      command_id: null,
    },
    ...fixturePolicy.resources.map((resource) => ({
      id: `resource:${fixturePolicy.summary.slug}:${resource.path}`,
      kind: "section" as const,
      title: resource.path,
      subtitle: resource.kind,
      body: resource.content,
      route: `/policies/${fixturePolicy.summary.slug}`,
      section_id: "resources",
      keywords: [resource.path, resource.kind, fixturePolicy.summary.slug],
      command_id: null,
    })),
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
  const differentRefSameHash = {
    ...base,
    sourceRevision: { ...base.sourceRevision, ref: "release" },
  };
  const differentRepositorySameHash = {
    ...base,
    sourceRevision: { ...base.sourceRevision, repository: "example/style-playbook-skills" },
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
  expect(comparePlaybookSnapshots(differentRefSameHash, base)).toMatchObject({
    status: "stale",
    sourceChanged: true,
    contentChanged: false,
    updateProvenance: true,
    rebuildContent: false,
    rebuildKeywordProjection: false,
  });
  expect(comparePlaybookSnapshots(differentRepositorySameHash, base)).toMatchObject({
    status: "stale",
    sourceChanged: true,
    contentChanged: false,
    updateProvenance: true,
    rebuildContent: false,
    rebuildKeywordProjection: false,
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
    "Search projection"
  );
});

test("rejects search documents that do not carry catalog content or keyword projections", () => {
  const wrongBody = structuredClone(completeFixtureSearch);
  const topicPage = wrongBody.documents.find((document) => document.id === "topic:delivery");
  if (!topicPage) throw new Error("topic search document is missing");
  topicPage.body = "wrong body";
  expect(() => normalizePlaybookSnapshot(publicFixtureCatalog, wrongBody)).toThrow(
    "Search projection body mismatch"
  );

  const wrongKeywords = structuredClone(completeFixtureSearch);
  const projectPage = wrongKeywords.documents.find(
    (document) => document.id === "project:sample-project"
  );
  if (!projectPage) throw new Error("project search document is missing");
  projectPage.keywords = [];
  expect(() => normalizePlaybookSnapshot(publicFixtureCatalog, wrongKeywords)).toThrow(
    "Search projection metadata mismatch"
  );

  const extraBody = structuredClone(completeFixtureSearch);
  const extraTopicPage = extraBody.documents.find((document) => document.id === "topic:delivery");
  if (!extraTopicPage) throw new Error("topic search document is missing");
  extraTopicPage.body += " unbound source prose";
  expect(() => normalizePlaybookSnapshot(publicFixtureCatalog, extraBody)).toThrow(
    "Search projection body mismatch"
  );
});

test("namespaces section identities by public object kind", () => {
  const catalog = structuredClone(publicFixtureCatalog);
  const topic = catalog.topic_details[0];
  const project = catalog.project_details[0];
  const snapshotTopic = catalog.snapshot.topics[0];
  const topicSection = topic?.sections[0];
  const projectSection = project?.sections[0];
  if (!topic || !project || !snapshotTopic || !topicSection || !projectSection)
    throw new Error("fixture catalog is incomplete");

  const collidingSlug = project.item.slug;
  topic.item.slug = collidingSlug;
  snapshotTopic.slug = collidingSlug;
  projectSection.id = topicSection.id;
  topicSection.id = projectSection.id;
  topic.policy_skills[0].summary.primary_topic = collidingSlug;

  const search = structuredClone(completeFixtureSearch);
  const topicPage = search.documents.find((document) => document.id === "topic:delivery");
  const topicSections = search.documents.filter((document) =>
    document.id.startsWith("section:topic:delivery:")
  );
  const projectSectionDocument = search.documents.find(
    (document) => document.id === `section:project:${project.item.slug}:architecture`
  );
  const policyPage = search.documents.find(
    (document) => document.id === `policy:${topic.policy_skills[0]?.summary.slug}`
  );
  if (!topicPage || !projectSectionDocument || !policyPage || topicSections.length !== 2)
    throw new Error("fixture search is incomplete");

  topicPage.id = `topic:${collidingSlug}`;
  topicPage.route = `/topics/${collidingSlug}`;
  for (const document of topicSections) {
    const sectionId = document.section_id;
    if (!sectionId) throw new Error("topic section identity is missing");
    document.id = `section:topic:${collidingSlug}:${sectionId}`;
    document.route = `/topics/${collidingSlug}`;
  }
  projectSectionDocument.id = `section:project:${collidingSlug}:${projectSection.id}`;
  projectSectionDocument.section_id = projectSection.id;
  policyPage.keywords = [policyPage.keywords[0] ?? "", collidingSlug];

  expect(() => normalizePlaybookSnapshot(catalog, search)).not.toThrow();
});

test("preserves whitespace-only section and resource bodies in exact projections", () => {
  const catalog = structuredClone(publicFixtureCatalog);
  const topic = catalog.topic_details[0];
  const project = catalog.project_details[0];
  const resource = topic?.policy_skills[0]?.resources[0];
  const topicSection = topic?.sections[0];
  const projectSection = project?.sections[0];
  if (!topic || !project || !resource || !topicSection || !projectSection)
    throw new Error("fixture catalog is incomplete");

  topicSection.markdown = "\n";
  projectSection.markdown = "\t";
  resource.content = " \n";

  const search = structuredClone(completeFixtureSearch);
  const topicPage = search.documents.find((document) => document.id === `topic:${topic.item.slug}`);
  const topicSectionDocument = search.documents.find(
    (document) => document.id === `section:topic:${topic.item.slug}:${topicSection.id}`
  );
  const projectPage = search.documents.find(
    (document) => document.id === `project:${project.item.slug}`
  );
  const projectSectionDocument = search.documents.find(
    (document) => document.id === `section:project:${project.item.slug}:${projectSection.id}`
  );
  const resourceDocument = search.documents.find(
    (document) => document.id === `resource:${fixturePolicy.summary.slug}:${resource.path}`
  );
  if (
    !topicPage ||
    !topicSectionDocument ||
    !projectPage ||
    !projectSectionDocument ||
    !resourceDocument
  )
    throw new Error("fixture search is incomplete");

  topicPage.body = [
    topic.item.description ?? "",
    topic.preamble,
    ...topic.sections.map((section) => section.markdown),
  ]
    .filter((bodyPart) => bodyPart.length > 0)
    .join(" ");
  topicSectionDocument.body = topicSection.markdown;
  projectPage.body = [
    project.item.description ?? "",
    project.preamble,
    ...project.sections.map((section) => section.markdown),
  ]
    .filter((bodyPart) => bodyPart.length > 0)
    .join(" ");
  projectSectionDocument.body = projectSection.markdown;
  resourceDocument.body = resource.content;

  expect(() => normalizePlaybookSnapshot(catalog, search)).not.toThrow();
});

test("rejects a resource projection that omits public resource content", () => {
  const invalidSearch = structuredClone(completeFixtureSearch);
  const resources = invalidSearch.documents.find((document) => document.section_id === "resources");
  if (!resources) throw new Error("resource search document is missing");
  resources.body = "resource summary only";
  expect(() => normalizePlaybookSnapshot(publicFixtureCatalog, invalidSearch)).toThrow(
    "Search projection body mismatch"
  );
});

test("rejects extra documents, missing Policy pages, and resource metadata drift", () => {
  const extraDocumentSearch = structuredClone(completeFixtureSearch);
  const topicPage = extraDocumentSearch.documents.find(
    (document) => document.id === "topic:delivery"
  );
  if (!topicPage) throw new Error("topic search document is missing");
  extraDocumentSearch.documents.push({ ...topicPage, id: "extra:topic", body: "unbound content" });
  expect(() => normalizePlaybookSnapshot(publicFixtureCatalog, extraDocumentSearch)).toThrow(
    "unexpected document"
  );

  const missingPolicySearch = structuredClone(completeFixtureSearch);
  missingPolicySearch.documents = missingPolicySearch.documents.filter(
    (document) => document.id !== "policy:safe-release"
  );
  expect(() => normalizePlaybookSnapshot(publicFixtureCatalog, missingPolicySearch)).toThrow(
    "Search projection metadata mismatch"
  );

  const wrongResourceSearch = structuredClone(completeFixtureSearch);
  const resource = wrongResourceSearch.documents.find(
    (document) => document.section_id === "resources"
  );
  if (!resource) throw new Error("resource search document is missing");
  resource.id = "resource:safe-release:wrong.sh";
  resource.title = "wrong.sh";
  resource.subtitle = "text";
  resource.keywords = [];
  expect(() => normalizePlaybookSnapshot(publicFixtureCatalog, wrongResourceSearch)).toThrow(
    "Search projection metadata mismatch"
  );
});

test("requires strict current catalog visibility and indexes detail preambles", () => {
  const legacyCatalog = structuredClone(publicFixtureCatalog);
  const legacyProject = legacyCatalog.project_details[0]?.item as unknown as Record<
    string,
    unknown
  >;
  const legacyTopic = legacyCatalog.topic_details[0]?.item as unknown as Record<string, unknown>;
  if (!legacyProject || !legacyTopic) throw new Error("fixture catalog is incomplete");
  legacyProject.visibility = null;
  Reflect.deleteProperty(legacyProject, "catalog_visibility");
  Reflect.deleteProperty(legacyProject, "source_visibility");
  Reflect.deleteProperty(legacyTopic, "catalog_visibility");
  expect(() => normalizePlaybookSnapshot(legacyCatalog, completeFixtureSearch)).toThrow();

  const preambleCatalog = structuredClone(publicFixtureCatalog);
  preambleCatalog.topic_details[0].preamble = "topic preamble must be searchable";
  preambleCatalog.project_details[0].preamble = "project preamble must be searchable";
  expect(() => normalizePlaybookSnapshot(preambleCatalog, completeFixtureSearch)).toThrow(
    "Search projection body mismatch"
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
    expect(() =>
      readPlaybookGitHubSourceConfig({
        STYLE_PLAYBOOK_GITHUB_REPOSITORY: "ignored\\..\\actual/repo",
      })
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

  test("classifies malformed source identity before checking token availability", async () => {
    const result = await loadPlaybookGitHubSnapshot(makeTransport(makeFixtureFiles()), {
      ...config,
      repository: "invalid",
      token: null,
    });
    expect(result).toMatchObject({ status: "invalid", repository: "invalid", ref: config.ref });
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

  test("classifies a missing fixed export path as invalid", async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      if (String(input).includes("/commits/"))
        return new Response(JSON.stringify({ sha: commit }), { status: 200 });
      return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    }) as unknown as typeof fetch;
    const result = await loadPlaybookGitHubSnapshot(
      createPlaybookGitHubSourceTransport("fixture-token", fetchImpl),
      config
    );
    expect(result.status).toBe("invalid");
  });

  test("classifies malformed successful Contents responses as invalid", async () => {
    for (const body of ["{", "null"]) {
      const fetchImpl = (async (input: RequestInfo | URL) => {
        if (String(input).includes("/commits/"))
          return new Response(JSON.stringify({ sha: commit }), { status: 200 });
        return new Response(body, { status: 200 });
      }) as unknown as typeof fetch;
      const result = await loadPlaybookGitHubSnapshot(
        createPlaybookGitHubSourceTransport("fixture-token", fetchImpl),
        config
      );
      expect(result.status).toBe("invalid");
    }
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
  expect(requests[0]?.init).toMatchObject({
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer fixture-token",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    redirect: "error",
  });
  expect(requests[0]?.init.signal).toBeInstanceOf(AbortSignal);
  expect(requests[1]?.init).toMatchObject({
    headers: {
      Accept: "application/vnd.github.object+json",
      Authorization: "Bearer fixture-token",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    redirect: "error",
  });
  expect(requests[1]?.init.signal).toBeInstanceOf(AbortSignal);
});

test("falls back to the raw GitHub media type for large file responses", async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const rawBytes = Buffer.from("large fixture bytes");
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init: init ?? {} });
    if (requests.length === 1)
      return new Response(JSON.stringify({ sha: commit }), { status: 200 });
    if (requests.length === 2)
      return new Response(
        JSON.stringify({
          type: "file",
          path: "public/playbook/catalog.json",
          encoding: "none",
          content: "",
        }),
        { status: 200 }
      );
    return new Response(rawBytes, { status: 200 });
  }) as unknown as typeof fetch;
  const transport = createPlaybookGitHubSourceTransport("fixture-token", fetchImpl);

  await transport.resolveRef({ repository: config.repository, ref: config.ref });
  await expect(
    transport.readFile({
      repository: config.repository,
      commit,
      path: "public/playbook/catalog.json",
    })
  ).resolves.toEqual(rawBytes);
  expect(requests[2]?.init).toMatchObject({
    headers: {
      Accept: "application/vnd.github.raw+json",
      Authorization: "Bearer fixture-token",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    redirect: "error",
  });
  expect(requests[2]?.init.signal).toBeInstanceOf(AbortSignal);
});

test("classifies interrupted response bodies as retryable failures", async () => {
  const fetchImpl = (async (input: RequestInfo | URL) => {
    if (String(input).includes("/commits/"))
      return new Response(JSON.stringify({ sha: commit }), { status: 200 });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("connection reset"));
      },
    });
    return new Response(body, { status: 200 });
  }) as unknown as typeof fetch;
  const result = await loadPlaybookGitHubSnapshot(
    createPlaybookGitHubSourceTransport("fixture-token", fetchImpl),
    config
  );
  expect(result.status).toBe("failed");
});

test("aborts a stalled GitHub request after the configured timeout", async () => {
  let requestSignal: AbortSignal | undefined;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestSignal = init?.signal ?? undefined;
    if (String(input).includes("/commits/"))
      return new Response(JSON.stringify({ sha: commit }), { status: 200 });
    return new Promise<Response>((_resolve, reject) => {
      if (!requestSignal) {
        reject(new Error("request signal is missing"));
        return;
      }
      requestSignal.addEventListener(
        "abort",
        () => reject(requestSignal?.reason ?? new Error("request timed out")),
        { once: true }
      );
    });
  }) as unknown as typeof fetch;
  const result = await loadPlaybookGitHubSnapshot(
    createPlaybookGitHubSourceTransport("fixture-token", fetchImpl, { requestTimeoutMs: 1 }),
    config
  );
  expect(result.status).toBe("failed");
  expect(requestSignal).toBeInstanceOf(AbortSignal);
  expect(requestSignal?.aborted).toBe(true);
});

test("rejects raw responses that exceed the GitHub source byte limit", async () => {
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("/commits/"))
      return new Response(JSON.stringify({ sha: commit }), { status: 200 });
    if (new Headers(init?.headers).get("Accept") !== "application/vnd.github.raw+json")
      return new Response(
        JSON.stringify({
          type: "file",
          path: "public/playbook/catalog.json",
          encoding: "none",
          content: "",
        }),
        { status: 200 }
      );
    return new Response("small body", {
      status: 200,
      headers: { "content-length": String(32 * 1024 * 1024 + 1) },
    });
  }) as unknown as typeof fetch;
  const transport = createPlaybookGitHubSourceTransport("fixture-token", fetchImpl);
  await transport.resolveRef({ repository: config.repository, ref: config.ref });
  await expect(
    transport.readFile({
      repository: config.repository,
      commit,
      path: "public/playbook/catalog.json",
    })
  ).rejects.toThrow("exceeds byte limit");
});
