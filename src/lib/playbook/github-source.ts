import { gunzipSync } from "node:zlib";
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
const GITHUB_SOURCE_MAX_COMMIT_SHA_BYTES = 128;
const GITHUB_SOURCE_MAX_CONTENTS_RESPONSE_BYTES = 48 * 1024 * 1024;
const GITHUB_COMMIT_SHA_ACCEPT = "application/vnd.github.sha";
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
  readReleaseBundle?(input: { repository: string; ref: string }): Promise<Uint8Array>;
  readReleaseManifest?(input: { repository: string; ref: string }): Promise<Uint8Array>;
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
  search: PlaybookSearchPayload,
  releaseProjection = false
) {
  const sectionDocumentId = (kind: "topic" | "project", slug: string, sectionId: string) =>
    `section:${kind}:${slug}:${sectionId}`;
  const expectedIds = new Set<string>();
  const projected: PlaybookSearchDocument[] = [];
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
    const document = find(input.id) ?? (releaseProjection ? find(`page:${input.id}`) : undefined);
    const canonicalRoute = playbookHref(input.route, input.sectionId);
    const sectionId = document?.section_id ?? null;
    const commandId = document?.command_id ?? null;
    if (releaseProjection) {
      if (
        (!document && !input.id.startsWith("policy:") && !input.id.startsWith("resource:")) ||
        (document &&
          (document.kind !== input.kind ||
            document.route !== canonicalRoute ||
            (document.section_id ?? null) !== input.sectionId ||
            document.command_id != null))
      )
        throw new Error(`Search projection coverage mismatch: ${canonicalRoute}`);
      if (document) expectedIds.add(document.id);
      projected.push({
        id: input.id,
        kind: input.kind,
        title: input.title,
        subtitle: input.subtitle,
        route: canonicalRoute,
        section_id: input.sectionId,
        command_id: null,
        keywords: input.keywords,
        body: input.bodyParts.filter(Boolean).join(" "),
      });
      return document;
    }
    if (
      !document ||
      document.id !== input.id ||
      document.kind !== input.kind ||
      document.title !== input.title ||
      document.subtitle !== input.subtitle ||
      document.route !== canonicalRoute ||
      sectionId !== input.sectionId ||
      commandId !== null ||
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
  if (releaseProjection) {
    const seen = new Set<string>();
    for (const document of search.documents) {
      if (seen.has(document.id)) throw new Error("Duplicate search document identity");
      seen.add(document.id);
      if (
        !expectedIds.has(document.id) &&
        document.kind !== "command" &&
        !(
          document.kind === "page" &&
          ((document.id === "page:surface:projects" && document.route === "/playbook/projects/") ||
            (document.id === "page:surface:topics" && document.route === "/playbook/topics/"))
        )
      )
        throw new Error(`Search projection contains unexpected document: ${document.id}`);
    }
    return { generated_at: search.generated_at, documents: projected };
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

function readReleaseManifest(bytes: Uint8Array) {
  const value = parseJson(decodeUtf8(bytes, "GitHub Playbook release manifest"));
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid("GitHub Playbook release manifest is invalid");
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 || !Array.isArray(record.files) || record.files.length !== 2)
    invalid("GitHub Playbook release manifest is invalid");
  const files = record.files.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      invalid("GitHub Playbook release manifest is invalid");
    const item = entry as Record<string, unknown>;
    if (
      typeof item.path !== "string" ||
      typeof item.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/u.test(item.sha256) ||
      typeof item.size !== "number" ||
      !Number.isSafeInteger(item.size) ||
      item.size < 0
    )
      invalid("GitHub Playbook release manifest is invalid");
    return { path: item.path, sha256: item.sha256, size: item.size };
  });
  if (
    new Set(files.map((file) => file.path)).size !== 2 ||
    !files.some((file) => file.path === "catalog.json") ||
    !files.some((file) => file.path === "search-documents.json")
  )
    invalid("GitHub Playbook release manifest file allowlist is invalid");
  const source = record.source as Record<string, unknown> | undefined;
  if (
    source &&
    (typeof source.tag !== "string" ||
      typeof source.commit !== "string" ||
      !/^[a-f0-9]{40}$/u.test(source.commit) ||
      typeof source.repository !== "string" ||
      typeof source.releaseId !== "string" ||
      !/^\d+$/u.test(source.releaseId))
  )
    invalid("GitHub Playbook release source identity is invalid");
  return {
    contentHash: typeof record.contentHash === "string" ? record.contentHash : null,
    files,
    source: source
      ? {
          repository: source.repository as string,
          tag: source.tag as string,
          commit: source.commit as string,
          releaseId: source.releaseId as string,
        }
      : null,
    bundle: record.bundle as { name: string; sha256: string; size: number } | undefined,
  };
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
    if (error instanceof PlaybookGitHubSourceInvalidError) throw error;
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
    if (transport.readReleaseBundle) {
      try {
        return { status: "ready", snapshot: await readPlaybookGitHubSnapshot(transport, config) };
      } catch (error) {
        if (
          config.ref !== "main" ||
          !(
            error instanceof PlaybookGitHubSourceReadError ||
            error instanceof PlaybookGitHubSourceInvalidError
          ) ||
          !(
            error.message.includes("public export read failed") ||
            error.message.includes("public export path is unavailable")
          )
        )
          throw error;
      }
      const bundle = await transport.readReleaseBundle({
        repository: config.repository,
        ref: config.ref,
      });
      const tar = gunzipSync(bundle, { maxOutputLength: GITHUB_SOURCE_MAX_FILE_BYTES * 2 });
      const files = new Map<string, Uint8Array>();
      for (let offset = 0; offset + 512 <= tar.length; ) {
        const header = tar.subarray(offset, offset + 512);
        if (header.every((value) => value === 0)) break;
        const name = Buffer.from(header.subarray(0, 100)).toString().replace(/\0.*$/u, "");
        const size = Number.parseInt(
          Buffer.from(header.subarray(124, 136)).toString().replace(/\0.*$/u, "").trim() || "0",
          8
        );
        const start = offset + 512;
        if (
          !name ||
          name.includes("..") ||
          name.startsWith("/") ||
          !Number.isSafeInteger(size) ||
          start + size > tar.length
        )
          invalid("GitHub Playbook release asset contains an unsafe or truncated entry");
        if (header[156] === 48) {
          if (files.has(name)) invalid("GitHub Playbook release asset contains duplicate files");
          files.set(name, tar.subarray(start, start + size));
        }
        offset += 512 + Math.ceil(size / 512) * 512;
      }
      const catalog = files.get("catalog.json");
      const search = files.get("search-documents.json");
      const manifest =
        files.get("manifest.json") ??
        files.get("playbook-public-manifest.json") ??
        (transport.readReleaseManifest
          ? await transport.readReleaseManifest({ repository: config.repository, ref: config.ref })
          : undefined);
      if (!catalog || !search || !manifest) invalid("GitHub Playbook release asset is incomplete");
      const parsedManifest = readReleaseManifest(manifest);
      if (parsedManifest.bundle) {
        if (parsedManifest.bundle.name !== "playbook-public.tar.gz")
          invalid("GitHub Playbook release bundle identity mismatch");
        verifyFile(bundle, parsedManifest.bundle);
      }
      if (
        parsedManifest.source &&
        (parsedManifest.source.repository !== config.repository ||
          (config.ref !== "main" && config.ref !== parsedManifest.source.tag) ||
          (await transport.resolveRef({
            repository: config.repository,
            ref: parsedManifest.source.tag,
          })) !== parsedManifest.source.commit)
      )
        invalid("GitHub Playbook release source identity mismatch");
      for (const entry of parsedManifest.files) {
        const content = files.get(entry.path);
        if (!content) invalid(`GitHub Playbook release asset is missing: ${entry.path}`);
        try {
          verifyFile(content, entry);
        } catch (error) {
          invalid(`GitHub Playbook release asset digest mismatch: ${entry.path}`, { cause: error });
        }
      }
      // Release exports use upstream page IDs and display-oriented search text.
      // Validate full public route/section coverage, then derive the Blog projection
      // exclusively from the digest-verified public catalog.
      const publicCatalog = assertPublicCatalog(
        catalogSchema.parse(parseJson(decodeUtf8(catalog, "GitHub Playbook public catalog")))
      );
      const upstreamSearch = searchSchema.parse(
        parseJson(decodeUtf8(search, "GitHub Playbook search documents"))
      );
      const projection = assertCompletePlaybookSearch(
        publicCatalog,
        {
          ...upstreamSearch,
          documents: upstreamSearch.documents.map((document) => ({
            ...document,
            route: validatePlaybookSearchRoute(publicCatalog, document),
          })),
        },
        true
      );
      const normalized = normalizePlaybookSnapshot(publicCatalog, projection);
      if (
        parsedManifest.contentHash &&
        parsedManifest.contentHash !== computePlaybookContentHash(normalized)
      )
        invalid("GitHub Playbook public export content digest mismatch");
      return {
        status: "ready",
        snapshot: {
          ...normalized,
          sourceRevision: {
            provider: "github",
            repository: config.repository,
            ref: parsedManifest.source?.tag ?? config.ref,
            commit: parsedManifest.source?.commit ?? (await transport.resolveRef(config)),
          },
          contentHash: computePlaybookContentHash(normalized),
        },
      };
    }
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
    let response = await fetchImpl(url, {
      headers: { ...headers, Accept: accept },
      redirect: accept === "application/octet-stream" ? "manual" : "error",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (accept === "application/octet-stream" && response.status === 302) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      const target = location ? new URL(location) : null;
      if (
        !target ||
        target.protocol !== "https:" ||
        target.hostname !== "release-assets.githubusercontent.com" ||
        target.username ||
        target.password
      )
        throw new PlaybookGitHubSourceInvalidError("GitHub release asset redirect is invalid");
      response = await fetchImpl(target.toString(), {
        headers: { Accept: accept },
        redirect: "error",
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
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
    if (contentLength && /^\d+$/u.test(contentLength) && Number(contentLength) > maxBytes) {
      await response.body.cancel().catch(() => undefined);
      throw new PlaybookGitHubSourceInvalidError(`${label} exceeds byte limit`);
    }
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
  async function json(url: string) {
    const response = await request(url, GITHUB_CONTENTS_OBJECT_ACCEPT, true);
    const bytes = await readResponseBytes(
      response,
      GITHUB_SOURCE_MAX_CONTENTS_RESPONSE_BYTES,
      "GitHub API response"
    );
    try {
      const value: unknown = parseJson(decodeUtf8(bytes, "GitHub API response"));
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("GitHub API response root must be an object");
      return value as Record<string, unknown>;
    } catch (error) {
      throw new PlaybookGitHubSourceInvalidError("GitHub public export response is malformed", {
        cause: error,
      });
    }
  }
  async function raw(url: string) {
    const response = await request(url, GITHUB_RAW_ACCEPT, true);
    return readResponseBytes(response, GITHUB_SOURCE_MAX_FILE_BYTES, "GitHub raw file response");
  }
  const releases = new Map<string, Promise<Record<string, unknown>>>();
  async function releaseAsset(repository: string, ref: string, name: string) {
    const key = `${repository}:${ref}`;
    if (!releases.has(key))
      releases.set(
        key,
        json(
          ref === "main"
            ? `https://api.github.com/repos/${repository}/releases/latest`
            : `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(ref)}`
        )
      );
    const release = await releases.get(key)!;
    const matches = Array.isArray(release.assets)
      ? release.assets.filter(
          (item) =>
            item && typeof item === "object" && (item as Record<string, unknown>).name === name
        )
      : [];
    if (matches.length !== 1)
      invalid(`GitHub Playbook release asset is missing or duplicated: ${name}`);
    const asset = Array.isArray(release.assets)
      ? (release.assets.find(
          (item) =>
            item && typeof item === "object" && (item as Record<string, unknown>).name === name
        ) as Record<string, unknown> | undefined)
      : undefined;
    if (typeof asset?.id !== "number" || !Number.isSafeInteger(asset.id))
      throw new PlaybookGitHubSourceInvalidError(
        `GitHub Playbook release asset is unavailable: ${name}`
      );
    const response = await request(
      `https://api.github.com/repos/${repository}/releases/assets/${asset.id}`,
      "application/octet-stream"
    );
    return readResponseBytes(
      response,
      GITHUB_SOURCE_MAX_FILE_BYTES,
      `GitHub Playbook release asset: ${name}`
    );
  }
  return {
    async resolveRef({ repository, ref }) {
      const response = await request(
        `https://api.github.com/repos/${repository}/commits/${encodeURIComponent(ref)}`,
        GITHUB_COMMIT_SHA_ACCEPT
      );
      const bytes = await readResponseBytes(
        response,
        GITHUB_SOURCE_MAX_COMMIT_SHA_BYTES,
        "GitHub commit SHA response"
      );
      let value: string;
      try {
        value = decodeUtf8(bytes, "GitHub commit SHA response").trim();
      } catch (error) {
        throw new PlaybookGitHubSourceInvalidError("GitHub commit response is malformed", {
          cause: error,
        });
      }
      if (!/^[a-f0-9]{40}$/u.test(value))
        throw new PlaybookGitHubSourceInvalidError("GitHub commit response has no valid SHA");
      return value;
    },
    async readFile({ repository, commit, path }) {
      const url = githubApiPath(repository, path, `ref=${encodeURIComponent(commit)}`);
      const value = await json(url);
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
    readReleaseBundle: ({ repository, ref }) =>
      releaseAsset(repository, ref, "playbook-public.tar.gz"),
    readReleaseManifest: ({ repository, ref }) =>
      releaseAsset(repository, ref, "playbook-public-manifest.json"),
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
