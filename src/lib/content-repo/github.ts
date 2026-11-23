import type { ContentRepoConfig } from "./config";

const DEFAULT_API_BASE = "https://api.github.com";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;

export type ContentRepoErrorKind = "failed" | "invalid" | "conflict";

export class ContentRepoError extends Error {
  constructor(
    readonly kind: ContentRepoErrorKind,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ContentRepoError";
  }
}

export interface ContentRepoTreeEntry {
  path: string;
  /** `null` deletes the path from the base tree. */
  sha: string | null;
}

export interface ContentRepoTransport {
  resolveHead(): Promise<{ commit: string; tree: string }>;
  listTree(tree: string): Promise<Map<string, string>>;
  readBlob(sha: string): Promise<Uint8Array>;
  createBlob(bytes: Uint8Array): Promise<string>;
  createTree(baseTree: string, entries: ContentRepoTreeEntry[]): Promise<string>;
  createCommit(input: { message: string; tree: string; parents: string[] }): Promise<string>;
  updateRef(commit: string): Promise<string>;
}

export interface ContentRepoTransportOptions {
  apiBase?: string;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
}

function readSha(value: unknown, label: string): string {
  if (typeof value !== "string" || !COMMIT_SHA_PATTERN.test(value))
    throw new ContentRepoError("invalid", `GitHub ${label} is not a valid SHA`);
  return value;
}

export function createContentRepoTransport(
  config: ContentRepoConfig,
  fetchImpl: typeof fetch = fetch,
  options: ContentRepoTransportOptions = {}
): ContentRepoTransport {
  if (!config.token) throw new ContentRepoError("failed", "Content repository token is missing");
  const apiBase = (options.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/u, "");
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${config.token}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const repoUrl = `${apiBase}/repos/${config.repository}`;

  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        ...init,
        headers: { ...headers, ...(init.headers ?? {}) },
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new ContentRepoError("failed", "GitHub request failed", { cause: error });
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      if (response.status === 409 || response.status === 422)
        throw new ContentRepoError("conflict", `GitHub rejected the update: ${response.status}`);
      if (response.status === 404)
        throw new ContentRepoError("invalid", "Content repository or ref is unavailable");
      throw new ContentRepoError("failed", `GitHub request failed: ${response.status}`);
    }
    return response;
  }

  async function requestJson(
    url: string,
    init: RequestInit = {}
  ): Promise<Record<string, unknown>> {
    const response = await request(url, init);
    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > maxResponseBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new ContentRepoError("invalid", "GitHub response exceeds the size limit");
    }
    const text = await response.text();
    if (text.length > maxResponseBytes)
      throw new ContentRepoError("invalid", "GitHub response exceeds the size limit");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new ContentRepoError("invalid", "GitHub response is malformed", { cause: error });
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new ContentRepoError("invalid", "GitHub response root must be an object");
    return parsed as Record<string, unknown>;
  }

  return {
    async resolveHead() {
      // `commits/{ref}` resolves a branch or tag name; `git/commits/{sha}` accepts only SHAs.
      const payload = await requestJson(`${repoUrl}/commits/${encodeURIComponent(config.ref)}`);
      const commitObject = payload.commit;
      const tree =
        commitObject && typeof commitObject === "object"
          ? (commitObject as Record<string, unknown>).tree
          : payload.tree;
      if (!tree || typeof tree !== "object")
        throw new ContentRepoError("invalid", "GitHub commit has no tree");
      return {
        commit: readSha(payload.sha, "commit"),
        tree: readSha((tree as Record<string, unknown>).sha, "tree"),
      };
    },

    async listTree(tree) {
      const payload = await requestJson(
        `${repoUrl}/git/trees/${readSha(tree, "tree")}?recursive=1`
      );
      if (payload.truncated === true)
        throw new ContentRepoError("invalid", "Content repository tree is truncated");
      const entries = Array.isArray(payload.tree) ? payload.tree : [];
      const blobs = new Map<string, string>();
      for (const entry of entries) {
        if (!entry || typeof entry !== "object") continue;
        const record = entry as Record<string, unknown>;
        if (record.type !== "blob" || typeof record.path !== "string") continue;
        blobs.set(record.path, readSha(record.sha, "blob"));
      }
      return blobs;
    },

    async readBlob(sha) {
      const response = await request(`${repoUrl}/git/blobs/${readSha(sha, "blob")}`, {
        headers: { Accept: "application/vnd.github.raw+json" },
      });
      const buffer = new Uint8Array(await response.arrayBuffer());
      if (buffer.byteLength > maxResponseBytes)
        throw new ContentRepoError("invalid", "GitHub blob exceeds the size limit");
      return buffer;
    },

    async createBlob(bytes) {
      const payload = await requestJson(`${repoUrl}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({
          content: Buffer.from(bytes).toString("base64"),
          encoding: "base64",
        }),
      });
      return readSha(payload.sha, "blob");
    },

    async createTree(baseTree, entries) {
      const payload = await requestJson(`${repoUrl}/git/trees`, {
        method: "POST",
        body: JSON.stringify({
          base_tree: readSha(baseTree, "tree"),
          tree: entries.map((entry) => ({
            path: entry.path,
            mode: "100644",
            type: "blob",
            sha: entry.sha,
          })),
        }),
      });
      return readSha(payload.sha, "tree");
    },

    async createCommit({ message, tree, parents }) {
      const payload = await requestJson(`${repoUrl}/git/commits`, {
        method: "POST",
        body: JSON.stringify({ message, tree, parents }),
      });
      return readSha(payload.sha, "commit");
    },

    async updateRef(commit) {
      if (COMMIT_SHA_PATTERN.test(config.ref))
        throw new ContentRepoError(
          "invalid",
          "CONTENT_REPO_REF must be a branch to receive pushed commits"
        );
      const payload = await requestJson(
        `${repoUrl}/git/refs/heads/${config.ref.split("/").map(encodeURIComponent).join("/")}`,
        {
          method: "PATCH",
          body: JSON.stringify({ sha: readSha(commit, "commit"), force: false }),
        }
      );
      const object = payload.object;
      if (!object || typeof object !== "object")
        throw new ContentRepoError("invalid", "GitHub ref update has no object");
      return readSha((object as Record<string, unknown>).sha, "ref");
    },
  };
}
