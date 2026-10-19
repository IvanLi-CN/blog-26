import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import { constants as fsConstants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  opendir,
  readdir,
  realpath,
  rm,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { TRPCError } from "@trpc/server";
import { and, eq, gt, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { getActiveLocalBasePath } from "@/config/paths";
import type { SearchSuggestionReason } from "@/lib/ai/search-suggestions";
import { generateSlugFromPath } from "@/lib/content-sources/utils";
import { db } from "@/lib/db";
import { buildMemoRelativePath, getServerLocalMemoRootPath } from "@/lib/memo-paths";
import { getRuntimePlaybookStore } from "@/lib/playbook/cache";
import { appendPublicCorsHeaders, createPublicCorsPreflightResponse } from "@/lib/public-cors";
import { resolveRuntimeContext } from "@/lib/runtime-context";
import { posts, systemShareSubmissions } from "@/lib/schema";
import { ContentSearchError } from "@/lib/search/native-query";
import {
  composeSystemShareMemoContent,
  normalizeSystemShareEditor,
  SYSTEM_SHARE_MAX_REQUEST_BYTES,
  validateSystemShareFiles,
} from "@/lib/system-share";
import { buildPublicSnapshot, resolvePublicMemoTitle } from "@/public-site/snapshot";
import { handleClippingRequest } from "@/server/clipping/api";
import { isClippingRowPublic } from "@/server/clipping/projection";
import { readAuthoredMemo } from "@/server/clipping/store";
import { createContext } from "@/server/context";
import { handlePublicAssetFacadeRequest } from "@/server/public-media";
import { appRouter } from "@/server/router";
import { triggerIncrementalSync } from "@/server/routers/memos";
import {
  type ContentSearchInput,
  contentSearchInputSchema,
  executeContentModes,
  type SearchProgressPhase,
} from "@/server/services/content-search";
import { suggestPublicSearchTerms } from "@/server/services/search-suggestions";
import { handlePlaybookRequest } from "./playbook";

const PUBLIC_API_ALLOWED_METHODS = ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"] as const;
const SEARCH_SUGGESTION_REASONS = new Set<SearchSuggestionReason>([
  "initial",
  "empty",
  "error",
  "filtered_empty",
]);
const SYSTEM_SHARE_PROCESSING_TTL_MS = 15 * 60 * 1000;

type SystemShareResult = {
  memoId: string;
  memoSlug: string;
  memo: unknown;
};

function isMissingPathError(error: unknown) {
  return error && typeof error === "object" && "code" in error && error.code === "ENOENT";
}

function isExistingPathError(error: unknown) {
  return error && typeof error === "object" && "code" in error && error.code === "EEXIST";
}

async function ensureSafeSystemShareDirectory(basePath: string, directory: string) {
  const rootPath = resolve(basePath);
  const targetPath = resolve(directory);
  const targetRelativePath = relative(rootPath, targetPath);
  if (targetRelativePath.startsWith("..") || isAbsolute(targetRelativePath)) {
    throw new Error("Invalid system-share path");
  }

  const canonicalRoot = await realpath(basePath);
  let currentPath = canonicalRoot;
  for (const segment of targetRelativePath.split(/[\\/]+/u).filter(Boolean)) {
    currentPath = join(currentPath, segment);
    let stat: Awaited<ReturnType<typeof lstat>>;
    try {
      stat = await lstat(currentPath);
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
      try {
        await mkdir(currentPath);
      } catch (mkdirError) {
        if (!isExistingPathError(mkdirError)) throw mkdirError;
      }
      stat = await lstat(currentPath);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error("Invalid system-share directory");
    }
  }
}

async function isSafeExistingSystemShareDirectory(basePath: string, directory: string) {
  const rootPath = resolve(basePath);
  const targetPath = resolve(directory);
  const targetRelativePath = relative(rootPath, targetPath);
  if (targetRelativePath.startsWith("..") || isAbsolute(targetRelativePath)) return false;

  let currentPath: string;
  try {
    currentPath = await realpath(basePath);
  } catch {
    return false;
  }
  for (const segment of targetRelativePath.split(/[\\/]+/u).filter(Boolean)) {
    currentPath = join(currentPath, segment);
    try {
      const stat = await lstat(currentPath);
      if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
    } catch {
      return false;
    }
  }
  return true;
}

async function assertSafeSystemShareFile(basePath: string, filePath: string) {
  const rootPath = await realpath(basePath);
  const expectedPath = resolve(filePath);
  const actualPath = await realpath(filePath);
  const relativePath = relative(rootPath, actualPath);
  if (
    actualPath !== expectedPath ||
    relativePath.startsWith("..") ||
    isAbsolute(relativePath) ||
    !(await lstat(actualPath)).isFile()
  ) {
    throw new Error("Invalid system-share file path");
  }
}

async function openSafeSystemShareDirectory(basePath: string, directory: string) {
  if (process.platform !== "linux") return null;
  const rootPath = resolve(basePath);
  const targetPath = resolve(directory);
  const targetRelativePath = relative(rootPath, targetPath);
  if (targetRelativePath.startsWith("..") || isAbsolute(targetRelativePath)) {
    throw new Error("Invalid system-share path");
  }

  const flags = fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW;
  let handle = await open(await realpath(basePath), flags);
  try {
    for (const segment of targetRelativePath.split(/[\\/]+/u).filter(Boolean)) {
      const next = await open(`/proc/self/fd/${handle.fd}/${segment}`, flags);
      await handle.close();
      handle = next;
    }
    return handle;
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

type SystemShareDirectoryHandle = Awaited<ReturnType<typeof open>>;

const SYSTEM_SHARE_DIRECTORY_FLAGS =
  fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW;

async function removeSafeSystemShareDirectoryContents(handle: SystemShareDirectoryHandle) {
  const directory = await opendir(`/proc/self/fd/${handle.fd}`);
  try {
    for await (const entry of directory) {
      const childPath = `/proc/self/fd/${handle.fd}/${entry.name}`;
      if (entry.isDirectory()) {
        let childHandle: SystemShareDirectoryHandle | null = null;
        try {
          childHandle = await open(childPath, SYSTEM_SHARE_DIRECTORY_FLAGS);
          await removeSafeSystemShareDirectoryContents(childHandle);
        } catch {
          // A replaced or inaccessible child is left in place rather than
          // following a path outside the opened directory.
        } finally {
          await childHandle?.close().catch(() => undefined);
        }
        await rmdir(childPath).catch(() => undefined);
      } else {
        // unlink never follows a symlink, and the parent is an open fd.
        await unlink(childPath).catch(() => undefined);
      }
    }
  } finally {
    await directory.close().catch(() => undefined);
  }
}

async function removeSafeSystemSharePath(basePath: string, targetPath: string) {
  if (process.platform !== "linux") {
    if (!(await isSafeExistingSystemShareDirectory(basePath, dirname(targetPath)))) return;
    await rm(targetPath, { recursive: true, force: true }).catch(() => undefined);
    return;
  }

  let parentHandle: SystemShareDirectoryHandle | null = null;
  try {
    parentHandle = await openSafeSystemShareDirectory(basePath, dirname(targetPath));
    if (!parentHandle) return;
    const targetName = basename(targetPath);
    const target = `/proc/self/fd/${parentHandle.fd}/${targetName}`;
    let stat: Awaited<ReturnType<typeof lstat>>;
    try {
      stat = await lstat(target);
    } catch (error) {
      if (isMissingPathError(error)) return;
      throw error;
    }
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      let childHandle: SystemShareDirectoryHandle | null = null;
      try {
        childHandle = await open(target, SYSTEM_SHARE_DIRECTORY_FLAGS);
        await removeSafeSystemShareDirectoryContents(childHandle);
      } finally {
        await childHandle?.close().catch(() => undefined);
      }
      await rmdir(target).catch(() => undefined);
      return;
    }
    await unlink(target).catch(() => undefined);
  } catch (error) {
    if (!isMissingPathError(error)) throw error;
  } finally {
    await parentHandle?.close().catch(() => undefined);
  }
}

function json(request: Request, data: unknown, init: ResponseInit = {}, extraHeaders?: Headers) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  if (extraHeaders) {
    for (const [key, value] of extraHeaders.entries()) {
      headers.set(key, value);
    }
  }
  appendPublicCorsHeaders(headers, request, PUBLIC_API_ALLOWED_METHODS);
  return new Response(JSON.stringify(data), { ...init, headers });
}

function statusFromTrpcError(error: TRPCError) {
  switch (error.code) {
    case "BAD_REQUEST":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "METHOD_NOT_SUPPORTED":
      return 405;
    case "CONFLICT":
      return 409;
    case "SERVICE_UNAVAILABLE":
      return 503;
    default:
      return 500;
  }
}

async function parseBody(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  try {
    return await request.json();
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid JSON body" });
  }
}

async function parseSystemShareForm(request: Request) {
  const readFormData = async (candidate: Request) => {
    try {
      return await candidate.formData();
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({ code: "BAD_REQUEST", message: "分享请求格式无效。" });
    }
  };
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > SYSTEM_SHARE_MAX_REQUEST_BYTES) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "分享请求过大。" });
  }

  if (!request.body) return readFormData(request);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > SYSTEM_SHARE_MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new TRPCError({ code: "BAD_REQUEST", message: "分享请求过大。" });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return readFormData(
    new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body,
    })
  );
}

async function cleanupAbandonedSystemShareStaging(input: {
  basePath: string;
  memoRoot: string;
  submissionId: string;
  keepLeaseToken: string;
  memoId: string;
}) {
  const root = join(
    input.basePath,
    input.memoRoot.replace(/^\/+/, ""),
    "assets",
    "system-share",
    input.submissionId
  );
  if (!(await isSafeExistingSystemShareDirectory(input.basePath, root))) return;
  let entries: Dirent[] = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    return;
  }

  const referencedLeaseTokens = new Set<string>();
  try {
    const authored = await readAuthoredMemo(input.memoId);
    const attachments = authored.frontmatter.attachments;
    if (Array.isArray(attachments)) {
      for (const attachment of attachments) {
        if (!attachment || typeof attachment !== "object" || !("path" in attachment)) continue;
        const attachmentPath = String(attachment.path).replace(/^\.\//u, "");
        const prefix = `assets/system-share/${input.submissionId}/`;
        if (!attachmentPath.startsWith(prefix)) continue;
        const leaseToken = attachmentPath.slice(prefix.length).split("/", 1)[0];
        if (leaseToken) referencedLeaseTokens.add(leaseToken);
      }
    }
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      return;
    }
  }

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .filter(
        (entry) => entry.name !== input.keepLeaseToken && !referencedLeaseTokens.has(entry.name)
      )
      .map((entry) =>
        removeSafeSystemSharePath(input.basePath, join(root, entry.name)).catch(() => undefined)
      )
  );
}

async function cleanupSystemShareLeaseStaging(input: {
  basePath: string;
  memoRoot: string;
  submissionId: string;
  leaseToken: string;
  memoId: string;
}) {
  const leaseDirectory = join(
    input.basePath,
    input.memoRoot.replace(/^\/+/, ""),
    "assets",
    "system-share",
    input.submissionId,
    input.leaseToken
  );
  if (!(await isSafeExistingSystemShareDirectory(input.basePath, leaseDirectory))) return;
  let referenced = false;
  try {
    const authored = await readAuthoredMemo(input.memoId);
    const attachments = authored.frontmatter.attachments;
    const prefix = `assets/system-share/${input.submissionId}/${input.leaseToken}/`;
    referenced =
      Array.isArray(attachments) &&
      attachments.some(
        (attachment) =>
          attachment &&
          typeof attachment === "object" &&
          "path" in attachment &&
          String(attachment.path).replace(/^\.\//u, "").startsWith(prefix)
      );
  } catch (error) {
    if (!isMissingPathError(error)) return;
  }
  if (!referenced) {
    await removeSafeSystemSharePath(input.basePath, leaseDirectory).catch(() => undefined);
  }
}

async function cleanupSystemShareMemoTemps(input: {
  basePath: string;
  memoRoot: string;
  submissionId: string;
}) {
  const directory = join(input.basePath, input.memoRoot.replace(/^\/+/, ""), "system-share");
  if (!(await isSafeExistingSystemShareDirectory(input.basePath, directory))) return;
  let entries: Dirent[] = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  const prefix = `${input.submissionId}.md.`;
  await Promise.all(
    entries
      .filter(
        (entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(".tmp")
      )
      .map((entry) =>
        removeSafeSystemSharePath(input.basePath, join(directory, entry.name)).catch(
          () => undefined
        )
      )
  );
}

async function cleanupExpiredSystemShareStaging(input: { basePath: string; memoRoot: string }) {
  const root = join(input.basePath, input.memoRoot.replace(/^\/+/, ""), "assets", "system-share");
  if (!(await isSafeExistingSystemShareDirectory(input.basePath, root))) return;

  const now = Date.now();
  const cutoff = now - SYSTEM_SHARE_PROCESSING_TTL_MS;
  let rows: Array<{
    submissionId: string;
    memoId: string | null;
    state: string;
    leaseToken: string | null;
    leaseExpiresAt: number | null;
  }> = [];
  try {
    rows = await db
      .select({
        submissionId: systemShareSubmissions.submissionId,
        memoId: systemShareSubmissions.memoId,
        state: systemShareSubmissions.state,
        leaseToken: systemShareSubmissions.leaseToken,
        leaseExpiresAt: systemShareSubmissions.leaseExpiresAt,
      })
      .from(systemShareSubmissions);
  } catch {
    return;
  }

  let submissions: Dirent[] = [];
  try {
    submissions = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const submission of submissions) {
    if (!submission.isDirectory()) continue;
    const submissionRoot = join(root, submission.name);
    if (!(await isSafeExistingSystemShareDirectory(input.basePath, submissionRoot))) continue;
    let leases: Dirent[] = [];
    try {
      leases = await readdir(submissionRoot, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const lease of leases) {
      if (!lease.isDirectory()) continue;
      const leaseDirectory = join(submissionRoot, lease.name);
      if (!(await isSafeExistingSystemShareDirectory(input.basePath, leaseDirectory))) continue;
      let leaseStat: Awaited<ReturnType<typeof lstat>>;
      try {
        leaseStat = await lstat(leaseDirectory);
      } catch {
        continue;
      }
      if (leaseStat.mtimeMs > cutoff) continue;

      const row = rows.find(
        (candidate) =>
          candidate.submissionId === submission.name && candidate.leaseToken === lease.name
      );
      if (
        row &&
        (row.state === "processing" || row.state === "committing") &&
        (row.leaseExpiresAt ?? 0) > now
      ) {
        continue;
      }
      let committedMemoId: string | null = row?.memoId ?? null;
      if (!committedMemoId) {
        const candidateMemoId = buildMemoRelativePath(
          `system-share/${submission.name}.md`,
          input.memoRoot
        );
        try {
          const authored = await readAuthoredMemo(candidateMemoId);
          const marker = authored.frontmatter.systemShare;
          if (
            marker &&
            typeof marker === "object" &&
            "source" in marker &&
            marker.source === "system-share" &&
            "submissionId" in marker &&
            marker.submissionId === submission.name
          ) {
            // The Memo file is the commit point. Preserve attachments even if
            // the process stopped before recording memoId in SQLite.
            committedMemoId = candidateMemoId;
          }
        } catch {
          // No committed Memo is present; the stale lease can be removed.
        }
      }
      if (committedMemoId) {
        await cleanupSystemShareLeaseStaging({
          basePath: input.basePath,
          memoRoot: input.memoRoot,
          submissionId: submission.name,
          leaseToken: lease.name,
          memoId: committedMemoId,
        });
        continue;
      }
      await removeSafeSystemSharePath(input.basePath, leaseDirectory).catch(() => undefined);
    }
  }
}

async function createCallerForRequest(request: Request) {
  const resHeaders = new Headers();
  const ctx = await createContext({ req: request, resHeaders });
  return {
    caller: appRouter.createCaller(ctx),
    resHeaders,
    ctx,
  };
}

function methodNotAllowed(request: Request, method: string) {
  return json(request, { error: `Method ${method} not allowed` }, { status: 405 });
}

function normalizeSuggestionReason(value: string | null): SearchSuggestionReason {
  return SEARCH_SUGGESTION_REASONS.has(value as SearchSuggestionReason)
    ? (value as SearchSuggestionReason)
    : "empty";
}

async function handleSystemShareRequest(
  request: Request,
  caller: ReturnType<typeof appRouter.createCaller>,
  ctx: Awaited<ReturnType<typeof createContext>>,
  resHeaders: Headers
) {
  if (request.method !== "POST") return methodNotAllowed(request, request.method);
  if (resolveRuntimeContext(request).mode !== "console") {
    return json(request, { error: "Not found" }, { status: 404 });
  }
  if (!ctx.isAdmin)
    throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以发布分享内容。" });

  const form = await parseSystemShareForm(request);
  const submissionId = String(form.get("submissionId") || "").trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      submissionId
    )
  ) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "分享提交标识无效。" });
  }

  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  const fileDescriptors = files.map((file) => ({
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
  }));
  const fileValidation = validateSystemShareFiles(fileDescriptors);
  if (!fileValidation.ok) {
    throw new TRPCError({ code: "BAD_REQUEST", message: fileValidation.error });
  }

  const rawTags = String(form.get("tags") || "[]");
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(rawTags);
    tags = Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "标签格式无效。" });
  }

  const normalized = normalizeSystemShareEditor({
    title: String(form.get("title") || ""),
    text: String(form.get("text") || ""),
    url: String(form.get("url") || ""),
    tags,
    isPublic: String(form.get("isPublic") || "false") === "true",
    files: fileDescriptors,
  });
  const basePath = getActiveLocalBasePath();
  if (!basePath) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "本地内容源未启用。" });
  }

  async function resolveMemo(
    memoId: string,
    memoSlug?: string | null
  ): Promise<SystemShareResult | null> {
    const row = await db
      .select({ id: posts.id, slug: posts.slug })
      .from(posts)
      .where(eq(posts.id, memoId))
      .limit(1)
      .then((rows) => rows[0]);
    try {
      await readAuthoredMemo(memoId);
    } catch {
      return null;
    }
    const slug = memoSlug || row?.slug || generateSlugFromPath(memoId, undefined, "memo");
    if (!slug) return null;
    try {
      const memo = await caller.memos.bySlug({ slug });
      if (memo.id !== memoId) return null;
      return { memoId, memoSlug: slug, memo };
    } catch (error) {
      if (error instanceof TRPCError && error.code === "NOT_FOUND") {
        try {
          await triggerIncrementalSync({ throwOnError: true });
          const memo = await caller.memos.bySlug({ slug });
          if (memo.id !== memoId) return null;
          return { memoId, memoSlug: slug, memo };
        } catch {
          return null;
        }
      }
      throw error;
    }
  }

  const memoRoot = getServerLocalMemoRootPath();
  await cleanupExpiredSystemShareStaging({ basePath, memoRoot });
  const deterministicMemoId = buildMemoRelativePath(`system-share/${submissionId}.md`, memoRoot);

  async function resolveCommittedSystemShare(memoId: string, memoSlug?: string | null) {
    try {
      const authored = await readAuthoredMemo(memoId);
      const marker = authored.frontmatter.systemShare;
      if (
        !marker ||
        typeof marker !== "object" ||
        !("source" in marker) ||
        marker.source !== "system-share" ||
        !("submissionId" in marker) ||
        marker.submissionId !== submissionId
      ) {
        return null;
      }
    } catch {
      return null;
    }
    const resolved = await resolveMemo(memoId, memoSlug);
    if (!resolved) return null;

    const indexed = await db
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.id, memoId))
      .limit(1)
      .then((rows) => rows[0]);
    if (indexed) return resolved;

    // A process can publish the authored file immediately before the content
    // source sync writes its posts/projection row. Rebuild that projection
    // before returning a detail URL that would otherwise 404.
    await triggerIncrementalSync({ throwOnError: true });
    const recovered = await db
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.id, memoId))
      .limit(1)
      .then((rows) => rows[0]);
    if (!recovered) return null;
    return resolveMemo(memoId, memoSlug);
  }

  const now = Date.now();
  const leaseToken = randomUUID();
  let reclaimedExpiredLease = false;
  let existing = await db
    .select()
    .from(systemShareSubmissions)
    .where(eq(systemShareSubmissions.submissionId, submissionId))
    .limit(1)
    .then((rows) => rows[0]);

  if (existing?.memoId) {
    const recovered = existing.classification
      ? await resolveCommittedSystemShare(existing.memoId, existing.memoSlug)
      : await resolveMemo(existing.memoId, existing.memoSlug);
    if (recovered) {
      await db
        .update(systemShareSubmissions)
        .set({
          memoSlug: recovered.memoSlug,
          state: "completed",
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: now,
        })
        .where(eq(systemShareSubmissions.submissionId, submissionId));
      return json(
        request,
        {
          ok: true,
          duplicate: true,
          memoId: recovered.memoId,
          memo: recovered.memo,
          classification: existing.classification ?? normalized.classification,
        },
        { status: 200 },
        resHeaders
      );
    }
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "该分享对应的 Memo 已被删除，不能重新创建。",
    });
  }

  if (existing) {
    // The filesystem publication is the commit point. If the process stopped
    // after that point but before the SQLite row was completed, recover the
    // authored Memo immediately even while the previous lease is unexpired.
    const recoveredCommit = await resolveCommittedSystemShare(
      deterministicMemoId,
      existing.memoSlug
    );
    if (recoveredCommit) {
      await db
        .update(systemShareSubmissions)
        .set({
          memoId: recoveredCommit.memoId,
          memoSlug: recoveredCommit.memoSlug,
          state: "completed",
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: now,
        })
        .where(eq(systemShareSubmissions.submissionId, submissionId));
      await cleanupAbandonedSystemShareStaging({
        basePath,
        memoRoot,
        submissionId,
        keepLeaseToken: "",
        memoId: deterministicMemoId,
      });
      await cleanupSystemShareMemoTemps({ basePath, memoRoot, submissionId });
      return json(
        request,
        {
          ok: true,
          duplicate: true,
          memoId: recoveredCommit.memoId,
          memo: recoveredCommit.memo,
          classification: existing.classification ?? normalized.classification,
        },
        { status: 200 },
        resHeaders
      );
    }
    const leaseExpiresAt =
      existing.leaseExpiresAt ?? existing.updatedAt + SYSTEM_SHARE_PROCESSING_TTL_MS;
    const leaseState = existing.state === "processing" || existing.state === "committing";
    if (leaseState && leaseExpiresAt > now) {
      throw new TRPCError({ code: "CONFLICT", message: "该分享正在处理中，请稍后重试。" });
    }
    reclaimedExpiredLease = leaseState && leaseExpiresAt <= now;
    await db
      .update(systemShareSubmissions)
      .set({
        state: "processing",
        leaseToken,
        leaseExpiresAt: now + SYSTEM_SHARE_PROCESSING_TTL_MS,
        updatedAt: now,
        classification: normalized.classification,
      })
      .where(
        and(
          eq(systemShareSubmissions.submissionId, submissionId),
          or(
            eq(systemShareSubmissions.state, "processing"),
            eq(systemShareSubmissions.state, "committing")
          ),
          or(
            lte(systemShareSubmissions.leaseExpiresAt, now),
            and(
              isNull(systemShareSubmissions.leaseExpiresAt),
              lt(systemShareSubmissions.updatedAt, now - SYSTEM_SHARE_PROCESSING_TTL_MS)
            )
          )
        )
      );
  } else {
    try {
      await db.insert(systemShareSubmissions).values({
        submissionId,
        memoId: null,
        memoSlug: null,
        classification: normalized.classification,
        state: "processing",
        leaseToken,
        leaseExpiresAt: now + SYSTEM_SHARE_PROCESSING_TTL_MS,
        createdAt: now,
        updatedAt: now,
      });
    } catch {
      throw new TRPCError({ code: "CONFLICT", message: "该分享正在处理中，请稍后重试。" });
    }
  }

  existing = await db
    .select()
    .from(systemShareSubmissions)
    .where(eq(systemShareSubmissions.submissionId, submissionId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!existing || existing.leaseToken !== leaseToken) {
    throw new TRPCError({ code: "CONFLICT", message: "该分享正在处理中，请稍后重试。" });
  }

  const stagedPaths: string[] = [];
  let createdMemoId: string | null = null;
  let createdMemoSlug: string | null = null;
  const stagedDirectory = join(
    basePath,
    memoRoot.replace(/^\/+/, ""),
    "assets",
    "system-share",
    submissionId,
    leaseToken
  );
  let stagingDirectorySafe = false;
  try {
    await ensureSafeSystemShareDirectory(basePath, stagedDirectory);
    stagingDirectorySafe = true;
    const attachments = [];
    const stagedAttachmentRefs: Array<{ persistedPath: string; fullPath: string }> = [];
    for (const [index, file] of files.entries()) {
      const originalName = basename(file.name || `file-${index + 1}`);
      const safeName = originalName.replace(/[^a-z0-9._-]+/giu, "_") || `file-${index + 1}`;
      const filename = `system-share/${submissionId}/${leaseToken}/${index + 1}-${safeName}`;
      const persistedPath = `${memoRoot.replace(/^\/+/, "")}/assets/${filename}`;
      const fullPath = join(basePath, persistedPath);
      const directory = dirname(fullPath);
      const directoryHandle = await openSafeSystemShareDirectory(basePath, directory);
      const writePath = directoryHandle
        ? `/proc/self/fd/${directoryHandle.fd}/${basename(fullPath)}`
        : fullPath;
      try {
        await writeFile(writePath, new Uint8Array(await file.arrayBuffer()), { flag: "wx" });
      } finally {
        await directoryHandle?.close().catch(() => undefined);
      }
      try {
        await assertSafeSystemShareFile(basePath, fullPath);
      } catch (error) {
        await removeSafeSystemSharePath(basePath, fullPath).catch(() => undefined);
        throw error;
      }
      stagedPaths.push(fullPath);
      if (
        process.env.NODE_ENV === "test" &&
        process.env.SYSTEM_SHARE_TEST_FAIL_AFTER_FILES === String(index + 1)
      ) {
        throw new Error("system-share attachment staging failure (test injection)");
      }
      stagedAttachmentRefs.push({ persistedPath: `./assets/${filename}`, fullPath });
      attachments.push({
        filename: file.name || filename,
        path: `./assets/${filename}`,
        contentType: file.type || "application/octet-stream",
        size: file.size,
        isImage: file.type.startsWith("image/"),
      });
    }

    const activeLease = await db
      .select({
        leaseToken: systemShareSubmissions.leaseToken,
        leaseExpiresAt: systemShareSubmissions.leaseExpiresAt,
      })
      .from(systemShareSubmissions)
      .where(
        and(
          eq(systemShareSubmissions.submissionId, submissionId),
          eq(systemShareSubmissions.state, "processing"),
          eq(systemShareSubmissions.leaseToken, leaseToken)
        )
      )
      .limit(1)
      .then((rows) => rows[0]);
    if (!activeLease || (activeLease.leaseExpiresAt ?? 0) <= Date.now()) {
      throw new TRPCError({ code: "CONFLICT", message: "该分享正在处理中，请稍后重试。" });
    }

    const commitStartedAt = Date.now();
    await db
      .update(systemShareSubmissions)
      .set({
        state: "committing",
        leaseExpiresAt: commitStartedAt + SYSTEM_SHARE_PROCESSING_TTL_MS,
        updatedAt: commitStartedAt,
      })
      .where(
        and(
          eq(systemShareSubmissions.submissionId, submissionId),
          eq(systemShareSubmissions.state, "processing"),
          eq(systemShareSubmissions.leaseToken, leaseToken),
          gt(systemShareSubmissions.leaseExpiresAt, commitStartedAt)
        )
      );
    const committingLease = await db
      .select({ leaseToken: systemShareSubmissions.leaseToken })
      .from(systemShareSubmissions)
      .where(
        and(
          eq(systemShareSubmissions.submissionId, submissionId),
          eq(systemShareSubmissions.state, "committing"),
          eq(systemShareSubmissions.leaseToken, leaseToken)
        )
      )
      .limit(1)
      .then((rows) => rows[0]);
    if (!committingLease) {
      throw new TRPCError({ code: "CONFLICT", message: "该分享正在处理中，请稍后重试。" });
    }

    const result = await caller.memos.create({
      content: composeSystemShareMemoContent(normalized),
      title: normalized.title || undefined,
      isPublic: normalized.isPublic,
      tags: normalized.tags,
      attachments,
      systemShare: {
        source: "system-share" as const,
        submissionId,
        leaseToken,
        ...(normalized.url ? { targetUrl: normalized.url } : {}),
      },
    });
    createdMemoId = typeof result === "object" && result && "id" in result ? String(result.id) : "";
    createdMemoSlug =
      typeof result === "object" && result && "slug" in result ? String(result.slug) : null;
    if (!createdMemoId || !createdMemoSlug) throw new Error("Memo 创建结果缺少详情身份");

    // Only reclaim an expired lease after the deterministic Memo file exists.
    // An older request may still be finishing its filesystem commit; deleting
    // its staging directory before that point could publish missing attachments.
    if (reclaimedExpiredLease) {
      await cleanupAbandonedSystemShareStaging({
        basePath,
        memoRoot,
        submissionId,
        keepLeaseToken: leaseToken,
        memoId: deterministicMemoId,
      });
    }

    const referencedAttachmentPaths = new Set(
      typeof result === "object" &&
        result &&
        "attachments" in result &&
        Array.isArray(result.attachments)
        ? result.attachments
            .map((attachment) =>
              attachment && typeof attachment === "object" && "path" in attachment
                ? String(attachment.path)
                : ""
            )
            .filter(Boolean)
        : []
    );
    await Promise.all(
      stagedAttachmentRefs
        .filter(({ persistedPath }) => !referencedAttachmentPaths.has(persistedPath))
        .map(({ fullPath }) => removeSafeSystemSharePath(basePath, fullPath))
    );
    if (
      !stagedAttachmentRefs.some(({ persistedPath }) =>
        referencedAttachmentPaths.has(persistedPath)
      )
    ) {
      await removeSafeSystemSharePath(basePath, stagedDirectory).catch(() => undefined);
    }
    await db
      .update(systemShareSubmissions)
      .set({
        memoId: createdMemoId,
        memoSlug: createdMemoSlug,
        state: "completed",
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: Date.now(),
      })
      .where(
        and(
          eq(systemShareSubmissions.submissionId, submissionId),
          eq(systemShareSubmissions.leaseToken, leaseToken)
        )
      );
    return json(
      request,
      {
        ok: true,
        duplicate: false,
        memoId: createdMemoId,
        memo: result,
        classification: normalized.classification,
      },
      { status: 201 },
      resHeaders
    );
  } catch (error) {
    let committedMemoFile = Boolean(createdMemoId);
    if (!committedMemoFile) {
      try {
        await readAuthoredMemo(deterministicMemoId);
        committedMemoFile = true;
      } catch {
        committedMemoFile = false;
      }
    }
    if (!committedMemoFile) {
      if (
        stagingDirectorySafe &&
        (await isSafeExistingSystemShareDirectory(basePath, stagedDirectory))
      ) {
        await Promise.all(
          stagedPaths.map((path) =>
            removeSafeSystemSharePath(basePath, path).catch(() => undefined)
          )
        );
        await removeSafeSystemSharePath(basePath, stagedDirectory).catch(() => undefined);
      }
      if (reclaimedExpiredLease) {
        // Retain an expired recovery row as a cleanup sentinel. A later retry
        // must still know that an older lease's staging tree may exist.
        await db
          .update(systemShareSubmissions)
          .set({
            state: "processing",
            leaseToken,
            leaseExpiresAt: Date.now() - 1,
            updatedAt: Date.now(),
          })
          .where(
            and(
              eq(systemShareSubmissions.submissionId, submissionId),
              eq(systemShareSubmissions.leaseToken, leaseToken)
            )
          );
      } else {
        await db
          .delete(systemShareSubmissions)
          .where(
            and(
              eq(systemShareSubmissions.submissionId, submissionId),
              eq(systemShareSubmissions.leaseToken, leaseToken)
            )
          );
      }
      // Keep staging owned by other lease tokens intact on failure. An older
      // request may already have passed the commit fence and still be writing
      // its attachment references; cleanup is deferred until a replacement
      // lease has published a complete deterministic Memo.
    } else if (createdMemoId) {
      await db
        .update(systemShareSubmissions)
        .set({
          memoId: createdMemoId,
          memoSlug: createdMemoSlug,
          updatedAt: Date.now(),
        })
        .where(
          and(
            eq(systemShareSubmissions.submissionId, submissionId),
            eq(systemShareSubmissions.leaseToken, leaseToken)
          )
        );
    } else {
      // A stale request may discover that another lease already committed the
      // deterministic Memo. Remove only this lease's unreferenced staging.
      await cleanupSystemShareLeaseStaging({
        basePath,
        memoRoot,
        submissionId,
        leaseToken,
        memoId: deterministicMemoId,
      });
    }
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "分享内容创建失败，请重试。" });
  }
}

async function normalizePublicSearchTitles<
  T extends { slug: string; type?: string; title?: string | null },
>(results: T[]) {
  const memoSlugs = Array.from(
    new Set(results.filter((result) => result.type === "memo").map((result) => result.slug))
  );
  if (memoSlugs.length === 0) return results;

  const memoRows = await db
    .select()
    .from(posts)
    .where(and(eq(posts.type, "memo"), inArray(posts.slug, memoSlugs)));
  const publicBySlug = new Map(
    await Promise.all(
      memoRows.map(async (row) => [row.slug, await isClippingRowPublic(row)] as const)
    )
  );
  const titleBySlug = new Map(
    await Promise.all(
      memoRows
        .filter((row) => publicBySlug.get(row.slug) ?? false)
        .map(async (row) => [row.slug, await resolvePublicMemoTitle(row)] as const)
    )
  );

  return results
    .map((result) =>
      result.type === "memo" && titleBySlug.has(result.slug)
        ? { ...result, title: titleBySlug.get(result.slug) ?? null }
        : result
    )
    .filter((result) => result.type !== "memo" || (publicBySlug.get(result.slug) ?? false));
}

function readPublicSearchInput(url: URL): unknown {
  return {
    q: (url.searchParams.get("q") || "").trim(),
    mode: (url.searchParams.get("mode") ?? "keyword") as "rag" | "rewrite" | "keyword",
    topK: Number(url.searchParams.get("topK") ?? 20),
    source: (url.searchParams.get("source") ?? "all") as "all" | "blog" | "playbook",
    type: (url.searchParams.get("type") ?? "all") as
      | "all"
      | "post"
      | "memo"
      | "clipping"
      | "topic"
      | "experience"
      | "policy",
  };
}

function sseEvent(encoder: TextEncoder, event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function searchStreamResponse(request: Request, input: ContentSearchInput, resHeaders: Headers) {
  const encoder = new TextEncoder();
  const executionController = new AbortController();
  const executionSignal = AbortSignal.any([request.signal, executionController.signal]);
  let cancelled = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let abortHandler: (() => void) | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (cancelled || request.signal.aborted) return;
        controller.enqueue(sseEvent(encoder, event, data));
      };
      const finish = () => {
        if (heartbeat) clearInterval(heartbeat);
        if (abortHandler) request.signal.removeEventListener("abort", abortHandler);
        try {
          controller.close();
        } catch {
          // The client may have cancelled the stream between the final event and close.
        }
      };
      const report = (phase: SearchProgressPhase) => send("progress", { phase });

      send("started", { requestedMode: input.mode });
      heartbeat = setInterval(() => {
        if (cancelled || request.signal.aborted) return;
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 2_000);
      abortHandler = () => {
        cancelled = true;
        executionController.abort(request.signal.reason);
        finish();
      };
      request.signal.addEventListener("abort", abortHandler, { once: true });

      void executeContentModes(input, {
        publishedOnly: true,
        signal: executionSignal,
        transport: "sse",
        onProgress: report,
      })
        .then(async (result) => {
          if (cancelled || request.signal.aborted) return;
          const results = await normalizePublicSearchTitles(result.results);
          send("result", { ...result, results });
        })
        .catch((error: unknown) => {
          if (cancelled || request.signal.aborted) return;
          const message =
            error instanceof TRPCError || error instanceof ContentSearchError
              ? error.message
              : "搜索失败，请稍后重试";
          const code =
            error instanceof TRPCError || error instanceof ContentSearchError
              ? error.code
              : "INTERNAL_SERVER_ERROR";
          send("error", { error: message, code });
        })
        .finally(finish);
    },
    cancel() {
      cancelled = true;
      executionController.abort(new DOMException("Search stream cancelled", "AbortError"));
      if (heartbeat) clearInterval(heartbeat);
      if (abortHandler) request.signal.removeEventListener("abort", abortHandler);
    },
  });
  const headers = new Headers(resHeaders);
  headers.set("content-type", "text/event-stream; charset=utf-8");
  headers.set("cache-control", "no-store, no-transform");
  headers.set("x-accel-buffering", "no");
  appendPublicCorsHeaders(headers, request, PUBLIC_API_ALLOWED_METHODS);
  return new Response(stream, { status: 200, headers });
}

export async function handlePublicApiRequest(request: Request, subPath: string) {
  try {
    if (request.method === "OPTIONS") {
      return createPublicCorsPreflightResponse(request, PUBLIC_API_ALLOWED_METHODS);
    }

    const url = new URL(request.url);
    const pathname = subPath.replace(/\/+/g, "/").replace(/\/$/, "") || "/";

    const assetMatch = pathname.match(
      /^\/assets\/(post|memo)\/([^/]+)\/([0-9a-f]+)(?:\/([a-z0-9-]+))?\/(card|cover|content|full|social|poster|play)\.([a-z0-9]+)$/iu
    );
    if (assetMatch) {
      return handlePublicAssetFacadeRequest(request, {
        kind: assetMatch[1],
        slug: decodeURIComponent(assetMatch[2]),
        mediaHash: assetMatch[3],
        renderId: assetMatch[4],
        variant: assetMatch[5],
        ext: assetMatch[6],
      });
    }

    if (pathname === "/snapshot") {
      if (request.method !== "GET") return methodNotAllowed(request, request.method);
      const snapshot = await buildPublicSnapshot();
      return json(request, snapshot, {
        status: 200,
        headers: {
          "cache-control": "no-store",
        },
      });
    }

    if (pathname === "/playbook/search-index" || pathname === "/playbook/resource") {
      const response = await handlePlaybookRequest(request, pathname, getRuntimePlaybookStore());
      appendPublicCorsHeaders(response.headers, request, PUBLIC_API_ALLOWED_METHODS);
      return response;
    }

    const { caller, resHeaders, ctx } = await createCallerForRequest(request);
    if (pathname === "/system-share") {
      return await handleSystemShareRequest(request, caller, ctx, resHeaders);
    }
    const clippingMatch = pathname.match(
      /^\/memos\/([^/]+)\/clipping(?:\/(status|reprocess|chat(?:\/events)?))?$/
    );
    if (clippingMatch) {
      const result = await handleClippingRequest(
        request,
        decodeURIComponent(clippingMatch[1]),
        clippingMatch[2] ?? "",
        ctx
      );
      appendPublicCorsHeaders(result.headers, request, PUBLIC_API_ALLOWED_METHODS);
      return result;
    }

    if (pathname === "/auth/me") {
      if (request.method !== "GET") return methodNotAllowed(request, request.method);
      const result = await caller.auth.me();
      return json(request, result, { status: 200 }, resHeaders);
    }

    if (pathname === "/auth/logout") {
      if (request.method !== "POST") return methodNotAllowed(request, request.method);
      const result = await caller.auth.logout();
      return json(request, result, { status: 200 }, resHeaders);
    }

    if (pathname === "/posts") {
      if (request.method !== "GET") return methodNotAllowed(request, request.method);
      const result = await caller.posts.list({
        page: Number(url.searchParams.get("page") || 1),
        limit: Number(url.searchParams.get("limit") || 10),
        search: url.searchParams.get("search") || undefined,
        category: url.searchParams.get("category") || undefined,
        tag: url.searchParams.get("tag") || undefined,
        published: url.searchParams.get("published") !== "false",
      });
      return json(request, result, { status: 200 }, resHeaders);
    }

    if (pathname === "/memos") {
      if (request.method === "GET") {
        const result = await caller.memos.list({
          cursor: url.searchParams.get("cursor") || undefined,
          direction: url.searchParams.get("direction") === "newer" ? "newer" : "older",
          limit: Number(url.searchParams.get("limit") || 20),
          search: url.searchParams.get("search") || undefined,
          tag: url.searchParams.get("tag") || undefined,
          publicOnly: url.searchParams.get("publicOnly") !== "false",
        });
        return json(request, result, { status: 200 }, resHeaders);
      }

      if (request.method === "POST") {
        const body = ((await parseBody(request)) || {}) as {
          content?: string;
          title?: string;
          isPublic?: boolean;
          tags?: string[];
          attachments?: Array<{ path: string }>;
        };
        const result = await caller.memos.create({
          content: body.content || "",
          title: body.title,
          isPublic: body.isPublic ?? true,
          tags: Array.isArray(body.tags) ? body.tags : [],
          attachments: Array.isArray(body.attachments) ? body.attachments : [],
        });
        return json(request, result, { status: 200 }, resHeaders);
      }

      return methodNotAllowed(request, request.method);
    }

    const memoMatch = pathname.match(/^\/memos\/([^/]+)$/);
    if (memoMatch) {
      const slug = decodeURIComponent(memoMatch[1]);
      if (request.method === "GET") {
        const result = await caller.memos.bySlug({ slug });
        return json(request, result, { status: 200 }, resHeaders);
      }
      if (request.method === "PATCH") {
        const body = ((await parseBody(request)) || {}) as {
          content?: string;
          title?: string;
          isPublic?: boolean;
          tags?: string[];
          attachments?: Array<{ path: string }>;
        };
        const existing = await caller.memos.bySlug({ slug });
        const rawExisting = await db
          .select()
          .from(posts)
          .where(eq(posts.id, existing.id))
          .limit(1)
          .then((rows) => rows[0]);
        if (rawExisting?.type !== "memo") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Memo 不存在" });
        }
        const authoredExisting = await readAuthoredMemo(rawExisting.id).catch(() => ({
          body: rawExisting.body,
          frontmatter: {} as Record<string, unknown>,
        }));
        const result = await caller.memos.update({
          id: existing.id,
          content: typeof body.content === "string" ? body.content : authoredExisting.body.trim(),
          title:
            body.title ??
            (typeof authoredExisting.frontmatter.title === "string"
              ? authoredExisting.frontmatter.title
              : ""),
          isPublic: body.isPublic ?? existing.isPublic,
          tags: Array.isArray(body.tags) ? body.tags : (existing.tags ?? []),
          attachments: Array.isArray(body.attachments)
            ? body.attachments
            : ((existing as { attachments?: Array<{ path: string }> }).attachments ?? []),
        });
        return json(request, result, { status: 200 }, resHeaders);
      }
      if (request.method === "DELETE") {
        const existing = await caller.memos.bySlug({ slug });
        const result = await caller.memos.delete({ id: existing.id });
        return json(request, result, { status: 200 }, resHeaders);
      }
      return methodNotAllowed(request, request.method);
    }

    if (pathname === "/tags/timeline") {
      if (request.method !== "GET") return methodNotAllowed(request, request.method);
      const tagPath = url.searchParams.get("tagPath") || "";
      const result = await caller.tags.timeline({
        tagPath,
        cursor: url.searchParams.get("cursor") || undefined,
        limit: Number(url.searchParams.get("limit") || 20),
      });
      return json(request, result, { status: 200 }, resHeaders);
    }

    if (pathname === "/search") {
      if (request.method !== "GET") return methodNotAllowed(request, request.method);
      const allowed = new Set([
        "q",
        "mode",
        "topK",
        "source",
        "type",
        "edition",
        "sourceReleaseId",
        "sourceTag",
      ]);
      if ([...url.searchParams.keys()].some((key) => !allowed.has(key)))
        throw new TRPCError({ code: "BAD_REQUEST", message: "unsupported-parameter" });
      const parsed = contentSearchInputSchema.safeParse(readPublicSearchInput(url));
      if (!parsed.success)
        return json(
          request,
          { error: "搜索参数无效", code: "BAD_REQUEST" },
          { status: 400 },
          resHeaders
        );
      const result = await caller.search.content(parsed.data);
      resHeaders.set("Search-Requested-Mode", result.requestedMode);
      resHeaders.set("Search-Effective-Mode", result.effectiveMode);
      if (result.reason) resHeaders.set("Search-Reason", result.reason);
      if (result.playbook) {
        resHeaders.set("Search-Playbook-Edition", result.playbook.edition);
        resHeaders.set("Search-Playbook-Source-Release-Id", result.playbook.sourceReleaseId);
        resHeaders.set("Search-Playbook-Source-Tag", result.playbook.sourceTag);
      }
      if (result.incompleteSources?.length)
        resHeaders.set("Search-Incomplete-Sources", result.incompleteSources.join(","));
      if (result.ragIncompleteSources?.length)
        resHeaders.set("Search-RAG-Incomplete-Sources", result.ragIncompleteSources.join(","));
      resHeaders.set(
        "access-control-expose-headers",
        "Search-Requested-Mode, Search-Effective-Mode, Search-Reason, Search-Playbook-Edition, Search-Playbook-Source-Release-Id, Search-Playbook-Source-Tag, Search-Incomplete-Sources, Search-RAG-Incomplete-Sources"
      );
      resHeaders.set("cache-control", "no-store");
      return json(
        request,
        await normalizePublicSearchTitles(result.results),
        { status: 200 },
        resHeaders
      );
    }

    if (pathname === "/search/stream") {
      if (request.method !== "GET") return methodNotAllowed(request, request.method);
      const allowed = new Set([
        "q",
        "mode",
        "topK",
        "source",
        "type",
        "edition",
        "sourceReleaseId",
        "sourceTag",
      ]);
      if ([...url.searchParams.keys()].some((key) => !allowed.has(key)))
        return json(
          request,
          { error: "unsupported-parameter", code: "BAD_REQUEST" },
          { status: 400 },
          resHeaders
        );
      const parsed = contentSearchInputSchema.safeParse(readPublicSearchInput(url));
      if (!parsed.success)
        return json(
          request,
          { error: "搜索参数无效", code: "BAD_REQUEST" },
          { status: 400 },
          resHeaders
        );
      if (parsed.data.mode === "keyword") {
        return json(
          request,
          { error: "流式搜索仅支持 AI 模式", code: "BAD_REQUEST" },
          { status: 400 },
          resHeaders
        );
      }
      return searchStreamResponse(request, parsed.data, resHeaders);
    }

    if (pathname === "/search/suggestions") {
      if (request.method !== "GET") return methodNotAllowed(request, request.method);
      const q = (url.searchParams.get("q") || "").trim();
      const reason = normalizeSuggestionReason(url.searchParams.get("reason"));
      const requestedLimit = Number(url.searchParams.get("limit") || 5);
      const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(5, requestedLimit)) : 5;
      if (!q) {
        return json(
          request,
          { suggestions: [], source: "fallback", reason },
          {
            status: 200,
            headers: {
              "cache-control": "no-store",
            },
          },
          resHeaders
        );
      }
      const strategy = url.searchParams.get("strategy") ?? "auto";
      if (strategy !== "auto" && strategy !== "deterministic")
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid suggestion strategy" });
      const result = await suggestPublicSearchTerms({ query: q, reason, limit, strategy });
      return json(
        request,
        result,
        {
          status: 200,
          headers: {
            "cache-control": "no-store",
          },
        },
        resHeaders
      );
    }

    if (pathname === "/comments") {
      if (request.method === "GET") {
        const result = await caller.comments.getComments({
          slug: url.searchParams.get("slug") || "",
          page: Number(url.searchParams.get("page") || 1),
          limit: Number(url.searchParams.get("limit") || 10),
        });
        return json(request, result, { status: 200 }, resHeaders);
      }
      if (request.method === "POST") {
        const body = (await parseBody(request)) || {};
        const result = await caller.comments.createComment(body as never);
        return json(request, result, { status: 200 }, resHeaders);
      }
      return methodNotAllowed(request, request.method);
    }

    const commentMatch = pathname.match(/^\/comments\/([^/]+)$/);
    if (commentMatch) {
      const commentId = decodeURIComponent(commentMatch[1]);
      if (request.method === "PATCH") {
        const body = ((await parseBody(request)) || {}) as { content?: string };
        const result = await caller.comments.editComment({
          commentId,
          content: body.content || "",
        });
        return json(request, result, { status: 200 }, resHeaders);
      }
      if (request.method === "DELETE") {
        const result = await caller.comments.deleteComment({ commentId });
        return json(request, result, { status: 200 }, resHeaders);
      }
      return methodNotAllowed(request, request.method);
    }

    const moderateMatch = pathname.match(/^\/comments\/([^/]+)\/moderate$/);
    if (moderateMatch) {
      if (request.method !== "POST") return methodNotAllowed(request, request.method);
      const commentId = decodeURIComponent(moderateMatch[1]);
      const body = ((await parseBody(request)) || {}) as { status?: "approved" | "rejected" };
      const result = await caller.comments.moderateComment({
        commentId,
        status: body.status || "approved",
      });
      return json(request, result, { status: 200 }, resHeaders);
    }

    if (pathname === "/reactions") {
      if (request.method !== "GET") return methodNotAllowed(request, request.method);
      const targetType = url.searchParams.get("targetType") as "post" | "comment" | null;
      const targetId = url.searchParams.get("targetId") || "";
      const result = await caller.reactions.getReactions({
        targetType: targetType || "post",
        targetId,
      });
      return json(request, result, { status: 200 }, resHeaders);
    }

    if (pathname === "/reactions/toggle") {
      if (request.method !== "POST") return methodNotAllowed(request, request.method);
      const body = ((await parseBody(request)) || {}) as {
        targetType?: "post" | "comment";
        targetId?: string;
        emoji?: string;
      };
      const result = await caller.reactions.toggle({
        targetType: body.targetType || "post",
        targetId: body.targetId || "",
        emoji: body.emoji || "👍",
      });
      return json(request, result, { status: 200 }, resHeaders);
    }

    return json(request, { error: "Not found" }, { status: 404 }, resHeaders);
  } catch (error) {
    if (error instanceof TRPCError) {
      return json(
        request,
        { error: error.message, code: error.code },
        { status: statusFromTrpcError(error) }
      );
    }

    console.error("[public-api] unexpected error", error);
    return json(request, { error: "Internal server error" }, { status: 500 });
  }
}
