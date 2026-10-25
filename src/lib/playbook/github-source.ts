import {
  computePlaybookContentHash,
  decodeUtf8,
  encodeJson,
  fileRecord,
  parseJson,
  verifyFile,
} from "./manifest";
import { getPlaybookPolicies, normalizePlaybookSearch, playbookHref } from "./navigation";
import {
  assertPublicCatalog,
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

export interface PlaybookGitHubSourceConfig {
  repository: string;
  ref: string;
  token: string | null;
}

export interface PlaybookGitHubSourceTransport {
  resolveRef(input: { repository: string; ref: string }): Promise<string>;
  readFile(input: { repository: string; commit: string; path: string }): Promise<Uint8Array>;
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
  const catalog = assertPublicCatalog(catalogInput);
  const search = normalizePlaybookSearch(catalog, searchSchema.parse(searchInput));
  assertCompletePlaybookSearch(catalog, search);
  return { catalog, search };
}

function assertCompletePlaybookSearch(
  catalog: PlaybookPublicCatalog,
  search: PlaybookSearchPayload
) {
  const pageRoutes = new Set(
    search.documents
      .filter((document) => document.kind === "page" && document.section_id == null)
      .map((document) => playbookHref(document.route))
  );
  const expectedPages = [
    ...catalog.topic_details.map((detail) => `/topics/${detail.item.slug}`),
    ...catalog.project_details.map((detail) => `/projects/${detail.item.slug}`),
    ...getPlaybookPolicies(catalog).map((policy) => `/policies/${policy.summary.slug}`),
  ].map((route) => playbookHref(route));
  for (const route of expectedPages) {
    if (!pageRoutes.has(route)) throw new Error(`Search is missing page projection: ${route}`);
  }

  const sectionRoutes = new Set(
    search.documents
      .filter((document) => document.kind !== "page" && document.section_id)
      .map((document) => playbookHref(document.route, document.section_id))
  );
  const expectedSections = [
    ...catalog.topic_details.flatMap((detail) =>
      detail.sections.map((section) => `/topics/${detail.item.slug}#${section.id}`)
    ),
    ...catalog.project_details.flatMap((detail) =>
      detail.sections.map((section) => `/projects/${detail.item.slug}#${section.id}`)
    ),
    ...getPlaybookPolicies(catalog).flatMap((policy) =>
      policy.resources.length ? [`/policies/${policy.summary.slug}#resources`] : []
    ),
  ].map((route) => playbookHref(route));
  for (const route of expectedSections) {
    if (!sectionRoutes.has(route))
      throw new Error(`Search is missing section projection: ${route}`);
  }
}

function invalid(message: string, options?: ErrorOptions): never {
  throw new PlaybookGitHubSourceInvalidError(message, options);
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
  try {
    githubRepositorySchema.parse(config.repository);
    githubRefSchema.parse(config.ref);
  } catch (error) {
    invalid("GitHub source configuration is invalid", { cause: error });
  }
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
  const sourceChanged = candidate.sourceRevision.commit !== adopted.sourceRevision.commit;
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
  fetchImpl: typeof fetch = fetch
): PlaybookGitHubSourceTransport {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  async function json(url: string) {
    const response = await fetchImpl(url, { headers, redirect: "error" });
    if (!response.ok) throw new Error(`GitHub API request failed: ${response.status}`);
    return (await response.json()) as Record<string, unknown>;
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
      const value = await json(
        githubApiPath(repository, path, `ref=${encodeURIComponent(commit)}`)
      );
      if (value.type !== "file" || value.path !== path || typeof value.content !== "string")
        throw new Error(`GitHub path is not a file: ${path}`);
      const content = value.content.replace(/\s/gu, "");
      const bytes = Buffer.from(content, "base64");
      if (bytes.toString("base64") !== content)
        throw new Error(`GitHub file is not valid base64: ${path}`);
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
