import {
  computePlaybookContentHash,
  decodeUtf8,
  encodeJson,
  fileRecord,
  parseJson,
  verifyFile,
} from "./manifest";
import {
  getPlaybookPolicies,
  normalizePlaybookSearch,
  playbookHref,
  validatePlaybookSearchRoute,
} from "./navigation";
import {
  assertPublicCatalog,
  catalogSchema,
  digestSchema,
  githubPublicExportManifestSchema,
  githubRefSchema,
  githubRepositorySchema,
  githubSourceRevisionSchema,
  searchSchema,
} from "./schema";
import type {
  PlaybookGitHubSnapshot,
  PlaybookNormalizedSnapshot,
  PlaybookPublicCatalog,
  PlaybookSearchDocument,
  PlaybookSearchPayload,
  PlaybookSnapshotComparison,
} from "./types";

export const PLAYBOOK_GITHUB_DEFAULT_REPOSITORY = "IvanLi-CN/style-playbook-skills";
export const PLAYBOOK_GITHUB_DEFAULT_REF = "main";
export const PLAYBOOK_GITHUB_PUBLIC_EXPORT_ROOT = "public/playbook";
export const PLAYBOOK_GITHUB_PUBLIC_ALLOWLIST = [
  `${PLAYBOOK_GITHUB_PUBLIC_EXPORT_ROOT}/manifest.json`,
  `${PLAYBOOK_GITHUB_PUBLIC_EXPORT_ROOT}/catalog.json`,
  `${PLAYBOOK_GITHUB_PUBLIC_EXPORT_ROOT}/search-documents.json`,
] as const;

const CATALOG_PATH = `${PLAYBOOK_GITHUB_PUBLIC_EXPORT_ROOT}/catalog.json`;
const SEARCH_PATH = `${PLAYBOOK_GITHUB_PUBLIC_EXPORT_ROOT}/search-documents.json`;
const MANIFEST_PATH = `${PLAYBOOK_GITHUB_PUBLIC_EXPORT_ROOT}/manifest.json`;
const GITHUB_SOURCE_REQUEST_TIMEOUT_MS = 30_000;
const GITHUB_SOURCE_MAX_FILE_BYTES = 32 * 1024 * 1024;
const GITHUB_SOURCE_MAX_API_RESPONSE_BYTES = 64 * 1024;
const GITHUB_SOURCE_MAX_CONTENTS_RESPONSE_BYTES = 48 * 1024 * 1024;
const GITHUB_CONTENTS_OBJECT_ACCEPT = "application/vnd.github.object+json";
const GITHUB_RAW_ACCEPT = "application/vnd.github.raw+json";

export interface PlaybookGitHubSourceConfig {
  repository: string;
  ref: string;
  token: string | null;
}

export interface PlaybookGitHubSourceTransport {
  resolveRef(input: { repository: string; ref: string }): Promise<string>;
  readFile(input: { repository: string; commit: string; path: string }): Promise<Uint8Array>;
}

export interface PlaybookGitHubSourceTransportOptions {
  requestTimeoutMs?: number;
}

export type PlaybookGitHubSourceResult =
  | {
      status: "ready";
      snapshot: PlaybookGitHubSnapshot;
    }
  | {
      status: "unconfigured";
      repository: string;
      ref: string;
    }
  | {
      status: "failed" | "invalid";
      repository: string;
      ref: string;
      message: string;
    };

export class PlaybookGitHubSourceInvalidError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PlaybookGitHubSourceInvalidError";
  }
}

export class PlaybookGitHubSourceReadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PlaybookGitHubSourceReadError";
  }
}

export function readPlaybookGitHubSourceConfig(
  env: Record<string, string | undefined> = process.env
): PlaybookGitHubSourceConfig {
  const repository =
    env.STYLE_PLAYBOOK_GITHUB_REPOSITORY?.trim() || PLAYBOOK_GITHUB_DEFAULT_REPOSITORY;
  const ref = env.STYLE_PLAYBOOK_GITHUB_REF?.trim() || PLAYBOOK_GITHUB_DEFAULT_REF;
  githubRepositorySchema.parse(repository);
  githubRefSchema.parse(ref);
  return {
    repository,
    ref,
    token: env.STYLE_PLAYBOOK_GITHUB_TOKEN?.trim() || null,
  };
}

export function normalizePlaybookSnapshot(
  catalogInput: unknown,
  searchInput: unknown
): PlaybookNormalizedSnapshot {
  // Parse the current public schema before the shared legacy-compatible validator.
  // GitHub exports must not gain public visibility through historical normalization.
  const catalog = assertPublicCatalog(catalogSchema.parse(catalogInput));
  const parsedSearch = searchSchema.parse(searchInput);
  const routedSearch: PlaybookSearchPayload = {
    generated_at: parsedSearch.generated_at,
    documents: parsedSearch.documents.map((document) => ({
      ...document,
      route: validatePlaybookSearchRoute(catalog, document),
    })),
  };
  assertCompletePlaybookSearch(catalog, routedSearch);
  const search = normalizePlaybookSearch(catalog, routedSearch);
  assertCompletePlaybookSearch(catalog, search);
  return { catalog, search };
}

function assertCompletePlaybookSearch(
  catalog: PlaybookPublicCatalog,
  search: PlaybookSearchPayload
) {
  const sectionDocumentId = (kind: "topic" | "project", slug: string, sectionId: string) =>
    `section:${kind}:${slug}:${sectionId}`;
  const expectedIds = new Set<string>();
  const find = (id: string) => search.documents.find((document) => document.id === id);
  const requireDocument = (input: {
    id: string;
    kind: PlaybookSearchDocument["kind"];
    title: string;
    subtitle: string;
    route: string;
    sectionId: string | null;
    keywords: string[];
    bodyParts: string[];
  }) => {
    expectedIds.add(input.id);
    const document = find(input.id);
    const canonicalRoute = playbookHref(input.route, input.sectionId);
    if (
      !document ||
      document.id !== input.id ||
      document.kind !== input.kind ||
      document.title !== input.title ||
      document.subtitle !== input.subtitle ||
      document.route !== canonicalRoute ||
      document.section_id !== input.sectionId ||
      document.command_id !== null ||
      document.keywords.length !== input.keywords.length ||
      input.keywords.some((keyword, index) => document.keywords[index] !== keyword)
    )
      throw new Error(`Search projection metadata mismatch: ${canonicalRoute}`);
    const expectedBody = input.bodyParts.filter((bodyPart) => bodyPart.length > 0).join(" ");
    if (document.body !== expectedBody)
      throw new Error(`Search projection body mismatch: ${canonicalRoute}`);
    return document;
  };

  for (const detail of catalog.topic_details) {
    const route = `/topics/${detail.item.slug}`;
    requireDocument({
      id: `topic:${detail.item.slug}`,
      kind: "page",
      title: detail.item.token,
      subtitle: "实践主题",
      route,
      sectionId: null,
      keywords: detail.item.categories,
      bodyParts: [
        detail.item.description ?? "",
        detail.preamble,
        ...detail.sections.map((section) => section.markdown),
      ],
    });
    for (const section of detail.sections) {
      requireDocument({
        id: sectionDocumentId("topic", detail.item.slug, section.id),
        kind: "section",
        title: section.title,
        subtitle: detail.item.token,
        route,
        sectionId: section.id,
        keywords: detail.item.categories,
        bodyParts: [section.markdown],
      });
    }
  }
  for (const detail of catalog.project_details) {
    const route = `/projects/${detail.item.slug}`;
    requireDocument({
      id: `project:${detail.item.slug}`,
      kind: "page",
      title: detail.title,
      subtitle: "项目实践",
      route,
      sectionId: null,
      keywords: detail.item.tags,
      bodyParts: [
        detail.item.description ?? "",
        detail.preamble,
        ...detail.sections.map((section) => section.markdown),
      ],
    });
    for (const section of detail.sections) {
      requireDocument({
        id: sectionDocumentId("project", detail.item.slug, section.id),
        kind: "section",
        title: section.title,
        subtitle: detail.title,
        route,
        sectionId: section.id,
        keywords: detail.item.tags,
        bodyParts: [section.markdown],
      });
    }
  }
  for (const policy of getPlaybookPolicies(catalog)) {
    const route = `/policies/${policy.summary.slug}`;
    requireDocument({
      id: `policy:${policy.summary.slug}`,
      kind: "page",
      title: policy.summary.name,
      subtitle: policy.summary.description,
      route,
      sectionId: null,
      keywords: [policy.summary.slug, policy.summary.primary_topic],
      bodyParts: [policy.instruction_markdown],
    });
    for (const resource of policy.resources)
      requireDocument({
        id: `resource:${policy.summary.slug}:${resource.path}`,
        kind: "section",
        title: resource.path,
        subtitle: resource.kind,
        route,
        sectionId: "resources",
        keywords: [resource.path, resource.kind, policy.summary.slug],
        bodyParts: [resource.content],
      });
  }
  const unexpected = search.documents.find((document) => !expectedIds.has(document.id));
  if (unexpected)
    throw new Error(`Search projection contains unexpected document: ${unexpected.id}`);
  if (search.documents.length !== expectedIds.size)
    throw new Error("Duplicate search document identity");
}

function invalid(message: string, options?: ErrorOptions): never {
  throw new PlaybookGitHubSourceInvalidError(message, options);
}

function validateSourceConfig(config: Pick<PlaybookGitHubSourceConfig, "repository" | "ref">) {
  try {
    githubRepositorySchema.parse(config.repository);
    githubRefSchema.parse(config.ref);
  } catch (error) {
    invalid("GitHub source configuration is invalid", { cause: error });
  }
}

function readExportValue(bytes: Uint8Array, label: string) {
  try {
    const text = decodeUtf8(bytes, label);
    const value = parseJson(text);
    if (encodeJson(value) !== text) invalid(`${label} is not canonical JSON`);
    return value;
  } catch (error) {
    if (error instanceof PlaybookGitHubSourceInvalidError) throw error;
    return invalid(`${label} is invalid`, { cause: error });
  }
}

function readExportManifest(bytes: Uint8Array) {
  try {
    return githubPublicExportManifestSchema.parse(
      readExportValue(bytes, "GitHub Playbook export manifest")
    );
  } catch (error) {
    if (error instanceof PlaybookGitHubSourceInvalidError) throw error;
    return invalid("GitHub Playbook export manifest is invalid", { cause: error });
  }
}

function readExportJson(bytes: Uint8Array, label: string) {
  return readExportValue(bytes, label);
}

function assertManifestFiles(
  manifest: ReturnType<typeof githubPublicExportManifestSchema.parse>,
  files: ReadonlyMap<string, Uint8Array>
) {
  const [catalogRecord, searchRecord] = manifest.files;
  if (catalogRecord.path === searchRecord.path)
    invalid("GitHub Playbook export file allowlist is duplicated");
  if (catalogRecord.path !== "catalog.json" || searchRecord.path !== "search-documents.json")
    invalid("GitHub Playbook export file allowlist is invalid");
  for (const record of manifest.files) {
    const path = `${PLAYBOOK_GITHUB_PUBLIC_EXPORT_ROOT}/${record.path}`;
    const content = files.get(path);
    if (!content) invalid(`GitHub Playbook export file is missing: ${record.path}`);
    try {
      verifyFile(content, record);
    } catch (error) {
      invalid(`GitHub Playbook export file digest mismatch: ${record.path}`, { cause: error });
    }
  }
}

export async function readPlaybookGitHubSnapshot(
  transport: PlaybookGitHubSourceTransport,
  config: PlaybookGitHubSourceConfig
): Promise<PlaybookGitHubSnapshot> {
  validateSourceConfig(config);
  let commit: string;
  try {
    commit = await transport.resolveRef({ repository: config.repository, ref: config.ref });
  } catch (error) {
    throw new PlaybookGitHubSourceReadError("GitHub ref resolution failed", { cause: error });
  }
  if (!/^[a-f0-9]{40}$/u.test(commit)) invalid("GitHub ref did not resolve to a commit SHA");

  const files = new Map<string, Uint8Array>();
  for (const path of PLAYBOOK_GITHUB_PUBLIC_ALLOWLIST) {
    try {
      files.set(path, await transport.readFile({ repository: config.repository, commit, path }));
    } catch (error) {
      if (error instanceof PlaybookGitHubSourceInvalidError) throw error;
      throw new PlaybookGitHubSourceReadError(`GitHub public export read failed: ${path}`, {
        cause: error,
      });
    }
  }

  const manifest = readExportManifest(files.get(MANIFEST_PATH) ?? new Uint8Array());
  assertManifestFiles(manifest, files);
  const catalogInput = readExportJson(
    files.get(CATALOG_PATH) ?? new Uint8Array(),
    "GitHub Playbook public catalog"
  );
  const searchInput = readExportJson(
    files.get(SEARCH_PATH) ?? new Uint8Array(),
    "GitHub Playbook search documents"
  );
  let normalized: PlaybookNormalizedSnapshot;
  try {
    normalized = normalizePlaybookSnapshot(catalogInput, searchInput);
  } catch (error) {
    if (error instanceof PlaybookGitHubSourceInvalidError) throw error;
    invalid("GitHub Playbook public export violates its schema or public boundary", {
      cause: error,
    });
  }
  const contentHash = computePlaybookContentHash(normalized);
  if (manifest.contentHash !== contentHash)
    invalid("GitHub Playbook public export content digest mismatch");
  const sourceRevision = githubSourceRevisionSchema.parse({
    provider: "github",
    repository: config.repository,
    ref: config.ref,
    commit,
  });
  return {
    ...normalized,
    sourceRevision,
    contentHash,
  };
}

export async function loadPlaybookGitHubSnapshot(
  transport: PlaybookGitHubSourceTransport,
  config: PlaybookGitHubSourceConfig
): Promise<PlaybookGitHubSourceResult> {
  try {
    validateSourceConfig(config);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "GitHub source configuration is invalid";
    return { status: "invalid", repository: config.repository, ref: config.ref, message };
  }
  if (!config.token)
    return { status: "unconfigured", repository: config.repository, ref: config.ref };
  try {
    return { status: "ready", snapshot: await readPlaybookGitHubSnapshot(transport, config) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub Playbook source failed";
    const status = error instanceof PlaybookGitHubSourceInvalidError ? "invalid" : "failed";
    return { status, repository: config.repository, ref: config.ref, message };
  }
}

export function comparePlaybookSnapshots(
  candidate: Pick<PlaybookGitHubSnapshot, "sourceRevision" | "contentHash">,
  adopted: Pick<PlaybookGitHubSnapshot, "sourceRevision" | "contentHash">
): PlaybookSnapshotComparison {
  githubSourceRevisionSchema.parse(candidate.sourceRevision);
  githubSourceRevisionSchema.parse(adopted.sourceRevision);
  digestSchema.parse(candidate.contentHash);
  digestSchema.parse(adopted.contentHash);
  const sourceChanged =
    candidate.sourceRevision.provider !== adopted.sourceRevision.provider ||
    candidate.sourceRevision.repository !== adopted.sourceRevision.repository ||
    candidate.sourceRevision.ref !== adopted.sourceRevision.ref ||
    candidate.sourceRevision.commit !== adopted.sourceRevision.commit;
  const contentChanged = candidate.contentHash !== adopted.contentHash;
  return {
    status: sourceChanged || contentChanged ? "stale" : "current",
    sourceChanged,
    contentChanged,
    updateProvenance: sourceChanged,
    rebuildContent: contentChanged,
    rebuildKeywordProjection: contentChanged,
  };
}

function githubApiPath(repository: string, path: string, query?: string) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${repository}/contents/${encodedPath}${query ? `?${query}` : ""}`;
}

export function createPlaybookGitHubSourceTransport(
  token: string,
  fetchImpl: typeof fetch = fetch,
  options: PlaybookGitHubSourceTransportOptions = {}
): PlaybookGitHubSourceTransport {
  const requestTimeoutMs = options.requestTimeoutMs ?? GITHUB_SOURCE_REQUEST_TIMEOUT_MS;
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0)
    throw new Error("GitHub source request timeout must be a positive integer");
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  async function request(url: string, accept = headers.Accept, invalidStatus = false) {
    const response = await fetchImpl(url, {
      headers: { ...headers, Accept: accept },
      redirect: "error",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) {
      if (invalidStatus && (response.status === 404 || response.status === 422))
        throw new PlaybookGitHubSourceInvalidError(
          `GitHub public export path is unavailable: ${response.status}`
        );
      throw new Error(`GitHub API request failed: ${response.status}`);
    }
    return response;
  }
  async function readResponseBytes(response: Response, maxBytes: number, label: string) {
    if (!response.body) throw new PlaybookGitHubSourceInvalidError(`${label} has no body`);
    const contentLength = response.headers.get("content-length");
    if (contentLength && /^\d+$/u.test(contentLength) && Number(contentLength) > maxBytes)
      throw new PlaybookGitHubSourceInvalidError(`${label} exceeds byte limit`);
    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes)
          throw new PlaybookGitHubSourceInvalidError(`${label} exceeds byte limit`);
        parts.push(value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    return Buffer.concat(parts);
  }
  async function json(url: string, invalidStatus = false) {
    const response = await request(
      url,
      invalidStatus ? GITHUB_CONTENTS_OBJECT_ACCEPT : headers.Accept,
      invalidStatus
    );
    const bytes = await readResponseBytes(
      response,
      invalidStatus
        ? GITHUB_SOURCE_MAX_CONTENTS_RESPONSE_BYTES
        : GITHUB_SOURCE_MAX_API_RESPONSE_BYTES,
      "GitHub API response"
    );
    try {
      const value: unknown = parseJson(decodeUtf8(bytes, "GitHub API response"));
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("GitHub API response root must be an object");
      return value as Record<string, unknown>;
    } catch (error) {
      if (!invalidStatus) throw error;
      throw new PlaybookGitHubSourceInvalidError("GitHub public export response is malformed", {
        cause: error,
      });
    }
  }
  async function raw(url: string) {
    const response = await request(url, GITHUB_RAW_ACCEPT, true);
    return readResponseBytes(response, GITHUB_SOURCE_MAX_FILE_BYTES, "GitHub raw file response");
  }
  return {
    async resolveRef({ repository, ref }) {
      const value = await json(
        `https://api.github.com/repos/${repository}/commits/${encodeURIComponent(ref)}`
      );
      if (typeof value.sha !== "string") throw new Error("GitHub commit response has no SHA");
      return value.sha;
    },
    async readFile({ repository, commit, path }) {
      const url = githubApiPath(repository, path, `ref=${encodeURIComponent(commit)}`);
      const value = await json(url, true);
      if (value.type !== "file" || value.path !== path)
        throw new PlaybookGitHubSourceInvalidError(`GitHub path is not a file: ${path}`);
      if (
        value.size !== undefined &&
        (typeof value.size !== "number" ||
          !Number.isSafeInteger(value.size) ||
          value.size < 0 ||
          value.size > GITHUB_SOURCE_MAX_FILE_BYTES)
      )
        throw new PlaybookGitHubSourceInvalidError(`GitHub file exceeds byte limit: ${path}`);
      if (value.encoding === "none" || value.content === "") return raw(url);
      if (typeof value.content !== "string")
        throw new PlaybookGitHubSourceInvalidError(`GitHub file has no content: ${path}`);
      const content = value.content.replace(/\s/gu, "");
      const bytes = Buffer.from(content, "base64");
      if (bytes.toString("base64") !== content)
        throw new PlaybookGitHubSourceInvalidError(`GitHub file is not valid base64: ${path}`);
      if (bytes.byteLength > GITHUB_SOURCE_MAX_FILE_BYTES)
        throw new PlaybookGitHubSourceInvalidError(`GitHub file exceeds byte limit: ${path}`);
      return bytes;
    },
  };
}

export function createPlaybookGitHubExportManifest(
  catalog: PlaybookPublicCatalog,
  search: PlaybookSearchPayload
) {
  const normalized = normalizePlaybookSnapshot(catalog, search);
  return {
    schemaVersion: 1 as const,
    contentHash: computePlaybookContentHash(normalized),
    files: [
      fileRecord("catalog.json", encodeJson(normalized.catalog)),
      fileRecord("search-documents.json", encodeJson(normalized.search)),
    ] as const,
  };
}
