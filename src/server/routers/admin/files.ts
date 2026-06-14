/**
 * 文件管理 tRPC 路由
 *
 * 提供本地内容源的文件操作接口
 */

import { resolve } from "node:path";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getConfiguredContentRootDirs,
  isPathWithinConfiguredRoots,
  normalizeRelativeContentPath,
} from "@/lib/content-path-mappings";
import {
  hasApiFilesReference,
  rebasePersistedLocalLinks,
  rebasePersistedLocalReferences,
  rewriteApiFilesUrlsToRelative,
} from "@/lib/persisted-paths";
import {
  getActiveLocalBasePath,
  getActiveLocalPathMappings,
  isLocalContentEnabled,
} from "../../../config/paths";
import { getContentSourceManager, LocalContentSource } from "../../../lib/content-sources";
import { adminProcedure, createTRPCRouter } from "../../trpc";

const listDirectorySchema = z.object({
  source: z.literal("local").default("local"),
  path: z.string().default(""),
});

const readFileSchema = z.object({
  source: z.literal("local").default("local"),
  path: z.string().min(1),
});

const writeFileSchema = z.object({
  source: z.literal("local").default("local"),
  path: z.string().min(1),
  content: z.string(),
});

const createDirectorySchema = z.object({
  source: z.literal("local").default("local"),
  path: z.string().min(1),
});

const renameFileSchema = z.object({
  source: z.literal("local").default("local"),
  oldPath: z.string().min(1),
  newName: z.string().min(1),
});

const fileEntrySchema = z.object({
  path: z.string().min(1),
  type: z.enum(["file", "directory"]),
});

const moveEntriesSchema = z.object({
  source: z.literal("local").default("local"),
  paths: z.array(z.string().min(1)).min(1),
  destinationPath: z.string().min(1),
});

const copyEntriesSchema = z.object({
  source: z.literal("local").default("local"),
  paths: z.array(z.string().min(1)).min(1),
  destinationPath: z.string().min(1),
});

const deleteEntriesSchema = z.object({
  source: z.literal("local").default("local"),
  entries: z.array(fileEntrySchema).min(1),
});

export interface FileItem {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  lastModified?: Date;
  extension?: string;
  count?: number;
}

export interface DataSource {
  name: "local";
  type: "local";
  enabled: boolean;
  description?: string;
}

type LocalPathMappingsSnapshot = ReturnType<typeof getActiveLocalPathMappings>;

type BatchEntryResult = {
  path: string;
  nextPath?: string;
  type: "file" | "directory";
};

type RollbackableResult<T> = T & {
  rollback: () => Promise<void>;
  commit?: () => Promise<void>;
};

type MarkdownWriteJournal = Map<string, string>;

function isMarkdownContentFile(path: string) {
  const lowerPath = path.toLowerCase();
  return lowerPath.endsWith(".md") || lowerPath.endsWith(".markdown") || lowerPath.endsWith(".mdx");
}

function requireLocalBasePath(): string {
  if (!isLocalContentEnabled()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "本地内容源未启用",
    });
  }
  const basePath = getActiveLocalBasePath();
  if (!basePath) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "本地内容根路径未配置",
    });
  }
  return basePath;
}

function getLocalConfiguredRootDirs(): string[] {
  return getConfiguredContentRootDirs(getActiveLocalPathMappings());
}

function normalizeLocalBrowserPath(path: string): string {
  const normalizedPath = normalizeRelativeContentPath(path || "");
  if (normalizedPath.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "本地路径不能包含 . 或 .. 路径段",
    });
  }
  return normalizedPath;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function readLocalPathMappingsMetadata(value: unknown): LocalPathMappingsSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    !isStringArray(record.posts) ||
    !isStringArray(record.projects) ||
    !isStringArray(record.memos)
  ) {
    return null;
  }

  return {
    posts: [...record.posts],
    projects: [...record.projects],
    memos: [...record.memos],
  };
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function areLocalPathMappingsEqual(
  left: LocalPathMappingsSnapshot,
  right: LocalPathMappingsSnapshot
): boolean {
  return (
    areStringArraysEqual(left.posts, right.posts) &&
    areStringArraysEqual(left.projects, right.projects) &&
    areStringArraysEqual(left.memos, right.memos)
  );
}

async function localSourceNeedsRefresh(
  source: LocalContentSource,
  desiredBasePath: string,
  desiredPathMappings: LocalPathMappingsSnapshot
): Promise<boolean> {
  const status = await source.getStatus();
  const metadata = status.metadata as Record<string, unknown>;
  const configuredBasePath =
    typeof metadata.contentPath === "string" ? resolve(metadata.contentPath) : null;
  const configuredPathMappings = readLocalPathMappingsMetadata(metadata.pathMappings);

  return (
    configuredBasePath !== desiredBasePath ||
    !configuredPathMappings ||
    !areLocalPathMappingsEqual(configuredPathMappings, desiredPathMappings)
  );
}

function assertLocalPathAllowed(path: string, options: { allowRoot?: boolean } = {}): string {
  const normalizedPath = normalizeLocalBrowserPath(path);
  if (!normalizedPath) {
    if (options.allowRoot) {
      return "";
    }

    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "本地路径不能为空",
    });
  }

  const localPathMappings = getActiveLocalPathMappings();
  if (!isPathWithinConfiguredRoots(normalizedPath, localPathMappings)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `路径不在已配置的本地内容根目录内: ${normalizedPath}`,
    });
  }

  return normalizedPath;
}

function isTreePathAncestor(path: string, targetPath: string) {
  const normalizedPath = normalizeLocalBrowserPath(path);
  const normalizedTargetPath = normalizeLocalBrowserPath(targetPath);
  if (!normalizedPath || !normalizedTargetPath || normalizedPath === normalizedTargetPath) {
    return false;
  }
  return normalizedTargetPath.startsWith(`${normalizedPath}/`);
}

function assertNoNestedSelection(paths: string[]) {
  const normalizedPaths = Array.from(
    new Set(paths.map((path) => normalizeLocalBrowserPath(path)).filter(Boolean))
  ).sort((left, right) => left.localeCompare(right));

  for (let index = 0; index < normalizedPaths.length; index += 1) {
    for (let nestedIndex = index + 1; nestedIndex < normalizedPaths.length; nestedIndex += 1) {
      if (isTreePathAncestor(normalizedPaths[index], normalizedPaths[nestedIndex])) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "不能同时操作父目录与其子项",
        });
      }
    }
  }

  return normalizedPaths;
}

function assertLocalRootOperationAllowed(path: string) {
  const normalizedPath = assertLocalPathAllowed(path);
  const configuredRoots = new Set(getLocalConfiguredRootDirs());
  if (configuredRoots.has(normalizedPath)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "不能直接操作已配置的本地内容根目录",
    });
  }
  return normalizedPath;
}

function getConfiguredRootForPath(path: string): string | null {
  const normalizedPath = normalizeLocalBrowserPath(path);
  const roots = getLocalConfiguredRootDirs().sort((left, right) => right.length - left.length);
  return (
    roots.find((root) => normalizedPath === root || normalizedPath.startsWith(`${root}/`)) ?? null
  );
}

function getConfiguredRootsForReferenceRebasing(): string[] {
  return getLocalConfiguredRootDirs();
}

function assertSameConfiguredRoot(sourcePath: string, targetPath: string) {
  const sourceRoot = getConfiguredRootForPath(sourcePath);
  const targetRoot = getConfiguredRootForPath(targetPath);

  if (!sourceRoot || !targetRoot || sourceRoot !== targetRoot) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "不能跨内容根目录操作项目",
    });
  }
}

async function ensureLocalDirectoryTarget(
  destinationPath: string
): Promise<{ relativePath: string; fullPath: string }> {
  const fs = await import("node:fs/promises");
  const nodePath = await import("node:path");
  const basePath = resolve(requireLocalBasePath());
  const normalizedRelativePath = assertLocalPathAllowed(destinationPath);
  const fullPath = nodePath.join(basePath, normalizedRelativePath);

  const stats = await fs.stat(fullPath).catch((error: NodeJS.ErrnoException) => {
    if (error?.code === "ENOENT") {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "目标目录不存在",
      });
    }
    throw error;
  });

  if (!stats.isDirectory()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "目标路径不是目录",
    });
  }

  return {
    relativePath: normalizedRelativePath,
    fullPath,
  };
}

function buildAdminContentSyncError(message?: string) {
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: message ? `内容同步失败：${message}` : "内容同步失败。",
  });
}

async function triggerAdminContentSync(): Promise<void> {
  try {
    const syncManager = getContentSourceManager({
      maxConcurrentSyncs: 2,
      syncTimeout: 30000,
      enableTransactions: true,
      conflictResolution: "priority",
    });
    const result = await syncManager.syncAll();
    if (result.success) {
      return;
    }

    const errorMessages = result.errors.map((entry) => entry.message).join(", ");
    throw buildAdminContentSyncError(errorMessages);
  } catch (syncError) {
    if (syncError instanceof TRPCError) {
      throw syncError;
    }
    throw buildAdminContentSyncError(syncError instanceof Error ? syncError.message : undefined);
  }
}

async function syncAndCommitFileMutation<
  T extends { rollback: () => Promise<void>; commit?: () => Promise<void> },
>(result: T): Promise<Omit<T, "rollback" | "commit">> {
  try {
    await triggerAdminContentSync();
  } catch (error) {
    await result.rollback();
    throw error;
  }
  await result.commit?.();
  const { rollback: _rollback, commit: _commit, ...payload } = result;
  return payload;
}

async function listLocalDirectory(path: string): Promise<FileItem[]> {
  const fs = await import("node:fs/promises");
  const nodePath = await import("node:path");

  const basePath = resolve(requireLocalBasePath());
  const normalizedPath = normalizeLocalBrowserPath(path);

  if (!normalizedPath) {
    const rootItems: FileItem[] = [];
    for (const rootDir of getLocalConfiguredRootDirs()) {
      const fullRootPath = nodePath.join(basePath, rootDir);
      try {
        const stats = await fs.stat(fullRootPath);
        if (!stats.isDirectory()) {
          continue;
        }

        const subEntries = await fs.readdir(fullRootPath);
        rootItems.push({
          name: nodePath.basename(rootDir),
          path: rootDir,
          type: "directory",
          count: subEntries.length,
        });
      } catch (error) {
        console.warn(`⚠️ [Files API] 跳过不存在的本地根目录 ${rootDir}:`, error);
      }
    }

    return rootItems;
  }

  const safePath = assertLocalPathAllowed(normalizedPath);
  const fullPath = nodePath.join(basePath, safePath);
  const entries = await fs.readdir(fullPath, { withFileTypes: true });

  const items: FileItem[] = [];

  for (const entry of entries) {
    const itemPath = nodePath.join(safePath, entry.name);
    const fullItemPath = nodePath.join(fullPath, entry.name);

    if (entry.isDirectory()) {
      let count = 0;
      try {
        const subEntries = await fs.readdir(fullItemPath);
        count = subEntries.length;
      } catch (error) {
        console.warn(`⚠️ [Files API] 无法获取目录 ${itemPath} 的项目数量:`, error);
      }

      items.push({
        name: entry.name,
        path: itemPath,
        type: "directory",
        count,
      });
      continue;
    }

    if (entry.isFile()) {
      const stats = await fs.stat(fullItemPath);
      items.push({
        name: entry.name,
        path: itemPath,
        type: "file",
        size: stats.size,
        lastModified: stats.mtime,
        extension: entry.name.split(".").pop(),
      });
    }
  }

  return items;
}

async function readLocalFile(path: string): Promise<string> {
  const fs = await import("node:fs/promises");
  const nodePath = await import("node:path");

  const basePath = resolve(requireLocalBasePath());
  const safePath = assertLocalPathAllowed(path);
  const fullPath = nodePath.join(basePath, safePath);
  return fs.readFile(fullPath, "utf-8");
}

async function snapshotWritableLocalFile(path: string) {
  const fs = await import("node:fs/promises");
  const nodePath = await import("node:path");
  const basePath = resolve(requireLocalBasePath());
  const safePath = assertLocalPathAllowed(path);
  const fullPath = nodePath.join(basePath, safePath);
  const previousContent = await fs
    .readFile(fullPath, "utf-8")
    .catch((error: NodeJS.ErrnoException) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });

  return {
    rollback: async () => {
      if (previousContent === null) {
        await fs.rm(fullPath, { force: true });
        return;
      }
      await fs.writeFile(fullPath, previousContent, "utf-8");
    },
  };
}

async function renameLocalFile(
  oldPath: string,
  newName: string
): Promise<RollbackableResult<{ newPath: string }>> {
  const fs = await import("node:fs/promises");
  const nodePath = await import("node:path");

  const basePath = resolve(requireLocalBasePath());
  const safeOldPath = assertLocalPathAllowed(oldPath);
  const configuredRoots = new Set(getLocalConfiguredRootDirs());
  if (configuredRoots.has(safeOldPath)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "不能直接重命名已配置的本地内容根目录",
    });
  }

  const fullOldPath = nodePath.join(basePath, safeOldPath);
  const pathParts = safeOldPath.split("/");
  pathParts[pathParts.length - 1] = newName;
  const newPath = pathParts.join("/");
  assertLocalPathAllowed(newPath);
  assertSameConfiguredRoot(safeOldPath, newPath);
  const fullNewPath = nodePath.join(basePath, newPath);

  try {
    await fs.access(fullNewPath);
    throw new TRPCError({
      code: "CONFLICT",
      message: "目标文件或目录已存在",
    });
  } catch (error: any) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  let renamed = false;
  await fs.rename(fullOldPath, fullNewPath);
  renamed = true;
  const journal: MarkdownWriteJournal = new Map();
  const rollback = async () => {
    try {
      await rollbackMarkdownWrites(journal);
    } finally {
      if (renamed) {
        await fs.rename(fullNewPath, fullOldPath).catch(() => undefined);
      }
    }
  };

  try {
    await rebaseMovedMarkdownLinks(fullNewPath, safeOldPath, newPath, nodePath, journal);
    await rebaseInboundMovedReferencesForAllRoots(
      [{ oldPath: safeOldPath, newPath }],
      nodePath,
      journal
    );
  } catch (error) {
    await rollback();
    throw error;
  }

  return { newPath, rollback };
}

async function writeMarkdownWithJournal(
  fullPath: string,
  content: string,
  journal: MarkdownWriteJournal
) {
  const fs = await import("node:fs/promises");
  if (!journal.has(fullPath)) {
    journal.set(fullPath, await fs.readFile(fullPath, "utf-8"));
  }
  await fs.writeFile(fullPath, content, "utf-8");
}

async function rollbackMarkdownWrites(journal: MarkdownWriteJournal) {
  const fs = await import("node:fs/promises");
  const entries = Array.from(journal.entries()).reverse();
  await Promise.all(entries.map(([fullPath, content]) => fs.writeFile(fullPath, content, "utf-8")));
}

async function rebaseMovedMarkdownLinks(
  fullPath: string,
  oldRelativePath: string,
  newRelativePath: string,
  nodePath: typeof import("node:path"),
  journal: MarkdownWriteJournal
) {
  const fs = await import("node:fs/promises");
  const stats = await fs.stat(fullPath).catch(() => null);
  if (!stats) return;

  if (stats.isFile()) {
    if (!isMarkdownContentFile(fullPath)) return;
    const currentContent = await fs.readFile(fullPath, "utf-8");
    const rebased = rebasePersistedLocalLinks(currentContent, oldRelativePath, newRelativePath);
    if (rebased.changed) {
      await writeMarkdownWithJournal(fullPath, rebased.content, journal);
    }
    return;
  }

  if (!stats.isDirectory()) return;

  const entries = await fs.readdir(fullPath, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const childFullPath = nodePath.join(fullPath, entry.name);
      const oldChildPath = normalizeLocalBrowserPath(`${oldRelativePath}/${entry.name}`);
      const newChildPath = normalizeLocalBrowserPath(`${newRelativePath}/${entry.name}`);
      await rebaseMovedMarkdownLinks(childFullPath, oldChildPath, newChildPath, nodePath, journal);
    })
  );
}

async function rebaseCopiedMarkdownLinks(
  fullPath: string,
  oldRelativePath: string,
  newRelativePath: string,
  nodePath: typeof import("node:path"),
  journal: MarkdownWriteJournal
) {
  const fs = await import("node:fs/promises");
  const stats = await fs.stat(fullPath).catch(() => null);
  if (!stats) return;

  if (stats.isFile()) {
    if (!isMarkdownContentFile(fullPath)) return;
    const currentContent = await fs.readFile(fullPath, "utf-8");
    const rebased = rebasePersistedLocalLinks(currentContent, oldRelativePath, newRelativePath);
    if (rebased.changed) {
      await writeMarkdownWithJournal(fullPath, rebased.content, journal);
    }
    return;
  }

  if (!stats.isDirectory()) return;

  const entries = await fs.readdir(fullPath, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const childFullPath = nodePath.join(fullPath, entry.name);
      const oldChildPath = normalizeLocalBrowserPath(`${oldRelativePath}/${entry.name}`);
      const newChildPath = normalizeLocalBrowserPath(`${newRelativePath}/${entry.name}`);
      await rebaseCopiedMarkdownLinks(childFullPath, oldChildPath, newChildPath, nodePath, journal);
    })
  );
}

async function rebaseInboundMovedReferences(
  rootPath: string,
  movedPairs: Array<{ oldPath: string; newPath: string }>,
  nodePath: typeof import("node:path"),
  journal: MarkdownWriteJournal
) {
  const fs = await import("node:fs/promises");
  const basePath = resolve(requireLocalBasePath());
  const fullRootPath = nodePath.join(basePath, rootPath);

  async function visit(fullPath: string, relativePath: string) {
    const stats = await fs.stat(fullPath).catch(() => null);
    if (!stats) return;

    if (stats.isDirectory()) {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      await Promise.all(
        entries.map((entry) =>
          visit(
            nodePath.join(fullPath, entry.name),
            normalizeLocalBrowserPath(`${relativePath}/${entry.name}`)
          )
        )
      );
      return;
    }

    if (!stats.isFile() || !isMarkdownContentFile(fullPath)) return;

    let content = await fs.readFile(fullPath, "utf-8");
    let changed = false;
    for (const pair of movedPairs) {
      const rebased = rebasePersistedLocalReferences(
        content,
        relativePath,
        pair.oldPath,
        pair.newPath
      );
      content = rebased.content;
      changed ||= rebased.changed;
    }

    if (changed) {
      await writeMarkdownWithJournal(fullPath, content, journal);
    }
  }

  await visit(fullRootPath, rootPath);
}

async function rebaseInboundMovedReferencesForAllRoots(
  movedPairs: Array<{ oldPath: string; newPath: string }>,
  nodePath: typeof import("node:path"),
  journal: MarkdownWriteJournal
) {
  await Promise.all(
    getConfiguredRootsForReferenceRebasing().map((rootPath) =>
      rebaseInboundMovedReferences(rootPath, movedPairs, nodePath, journal)
    )
  );
}

async function moveLocalEntries(
  paths: string[],
  destinationPath: string
): Promise<RollbackableResult<{ moved: BatchEntryResult[] }>> {
  const fs = await import("node:fs/promises");
  const nodePath = await import("node:path");
  const basePath = resolve(requireLocalBasePath());
  const normalizedPaths = assertNoNestedSelection(paths).map(assertLocalRootOperationAllowed);
  const { relativePath: normalizedDestinationPath } =
    await ensureLocalDirectoryTarget(destinationPath);

  const operations = await Promise.all(
    normalizedPaths.map(async (currentPath) => {
      const fullCurrentPath = nodePath.join(basePath, currentPath);
      const stats = await fs.stat(fullCurrentPath).catch((error: NodeJS.ErrnoException) => {
        if (error?.code === "ENOENT") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `源路径不存在: ${currentPath}`,
          });
        }
        throw error;
      });
      const itemName = nodePath.basename(currentPath);
      const nextRelativePath = normalizeLocalBrowserPath(
        normalizedDestinationPath ? `${normalizedDestinationPath}/${itemName}` : itemName
      );

      if (currentPath === nextRelativePath) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "目标目录与原目录相同",
        });
      }

      if (stats.isDirectory() && isTreePathAncestor(currentPath, normalizedDestinationPath)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "不能将目录移动到其自身或后代目录内",
        });
      }

      assertLocalPathAllowed(nextRelativePath);
      assertSameConfiguredRoot(currentPath, nextRelativePath);

      const fullNextPath = nodePath.join(basePath, nextRelativePath);
      await fs.access(fullNextPath).then(
        () => {
          throw new TRPCError({
            code: "CONFLICT",
            message: `目标已存在: ${nextRelativePath}`,
          });
        },
        (error: NodeJS.ErrnoException) => {
          if (error?.code !== "ENOENT") {
            throw error;
          }
        }
      );

      return {
        path: currentPath,
        nextPath: nextRelativePath,
        type: stats.isDirectory() ? "directory" : "file",
        fullCurrentPath,
        fullNextPath,
      };
    })
  );

  const nextPaths = new Set<string>();
  for (const operation of operations) {
    if (nextPaths.has(operation.nextPath)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "批量移动目标存在重名冲突",
      });
    }
    nextPaths.add(operation.nextPath);
  }

  const journal: MarkdownWriteJournal = new Map();
  const committedOperations: typeof operations = [];
  const rollback = async () => {
    try {
      await rollbackMarkdownWrites(journal);
    } finally {
      for (const operation of [...committedOperations].reverse()) {
        await fs.rename(operation.fullNextPath, operation.fullCurrentPath).catch(() => undefined);
      }
    }
  };

  try {
    for (const operation of operations) {
      await fs.rename(operation.fullCurrentPath, operation.fullNextPath);
      committedOperations.push(operation);
      await rebaseMovedMarkdownLinks(
        operation.fullNextPath,
        operation.path,
        operation.nextPath,
        nodePath,
        journal
      );
    }
    await rebaseInboundMovedReferencesForAllRoots(
      operations.map(({ path, nextPath }) => ({ oldPath: path, newPath: nextPath })),
      nodePath,
      journal
    );
  } catch (error) {
    await rollback();
    throw error;
  }

  return {
    moved: operations.map(({ path, nextPath, type }) => ({ path, nextPath, type })),
    rollback,
  };
}

async function copyLocalEntries(
  paths: string[],
  destinationPath: string
): Promise<RollbackableResult<{ copied: BatchEntryResult[] }>> {
  const fs = await import("node:fs/promises");
  const nodePath = await import("node:path");
  const basePath = resolve(requireLocalBasePath());
  const normalizedPaths = assertNoNestedSelection(paths).map(assertLocalRootOperationAllowed);
  const { relativePath: normalizedDestinationPath } =
    await ensureLocalDirectoryTarget(destinationPath);

  const operations = await Promise.all(
    normalizedPaths.map(async (currentPath) => {
      const fullCurrentPath = nodePath.join(basePath, currentPath);
      const stats = await fs.stat(fullCurrentPath).catch((error: NodeJS.ErrnoException) => {
        if (error?.code === "ENOENT") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `源路径不存在: ${currentPath}`,
          });
        }
        throw error;
      });
      const itemName = nodePath.basename(currentPath);
      const nextRelativePath = normalizeLocalBrowserPath(
        normalizedDestinationPath ? `${normalizedDestinationPath}/${itemName}` : itemName
      );
      if (stats.isDirectory() && isTreePathAncestor(currentPath, normalizedDestinationPath)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "不能将目录复制到其自身或后代目录内",
        });
      }
      assertLocalPathAllowed(nextRelativePath);
      assertSameConfiguredRoot(currentPath, nextRelativePath);
      const fullNextPath = nodePath.join(basePath, nextRelativePath);
      await fs.access(fullNextPath).then(
        () => {
          throw new TRPCError({
            code: "CONFLICT",
            message: `目标已存在: ${nextRelativePath}`,
          });
        },
        (error: NodeJS.ErrnoException) => {
          if (error?.code !== "ENOENT") {
            throw error;
          }
        }
      );

      return {
        path: currentPath,
        nextPath: nextRelativePath,
        type: stats.isDirectory() ? "directory" : "file",
        fullCurrentPath,
        fullNextPath,
      };
    })
  );

  const nextPaths = new Set<string>();
  for (const operation of operations) {
    if (nextPaths.has(operation.nextPath)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "批量复制目标存在重名冲突",
      });
    }
    nextPaths.add(operation.nextPath);
  }

  const journal: MarkdownWriteJournal = new Map();
  const committedOperations: typeof operations = [];
  const rollback = async () => {
    try {
      await rollbackMarkdownWrites(journal);
    } finally {
      await Promise.all(
        committedOperations.map((operation) =>
          fs.rm(operation.fullNextPath, { recursive: true, force: true })
        )
      );
    }
  };

  try {
    for (const operation of operations) {
      await fs.cp(operation.fullCurrentPath, operation.fullNextPath, {
        recursive: operation.type === "directory",
        errorOnExist: true,
        force: false,
      });
      committedOperations.push(operation);
    }

    for (const operation of operations) {
      await rebaseCopiedMarkdownLinks(
        operation.fullNextPath,
        operation.path,
        operation.nextPath,
        nodePath,
        journal
      );
    }

    const copiedPairs = operations.map(({ path, nextPath }) => ({
      oldPath: path,
      newPath: nextPath,
    }));
    await Promise.all(
      operations.map((operation) =>
        rebaseInboundMovedReferences(operation.nextPath, copiedPairs, nodePath, journal)
      )
    );
  } catch (error) {
    await rollback();
    throw error;
  }

  return {
    copied: operations.map(({ path, nextPath, type }) => ({ path, nextPath, type })),
    rollback,
  };
}

async function deleteLocalEntries(
  entries: Array<{ path: string; type: "file" | "directory" }>
): Promise<RollbackableResult<{ deleted: BatchEntryResult[] }>> {
  const fs = await import("node:fs/promises");
  const nodePath = await import("node:path");
  const basePath = resolve(requireLocalBasePath());
  const normalizedPaths = assertNoNestedSelection(entries.map((entry) => entry.path));
  const entryMap = new Map(
    entries.map((entry) => [normalizeLocalBrowserPath(entry.path), entry.type])
  );

  const operations = await Promise.all(
    normalizedPaths.map(async (currentPath) => {
      const normalizedCurrentPath = assertLocalRootOperationAllowed(currentPath);
      const fullCurrentPath = nodePath.join(basePath, normalizedCurrentPath);
      const stats = await fs.stat(fullCurrentPath).catch((error: NodeJS.ErrnoException) => {
        if (error?.code === "ENOENT") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `源路径不存在: ${normalizedCurrentPath}`,
          });
        }
        throw error;
      });
      const declaredType = entryMap.get(currentPath);
      const actualType = stats.isDirectory() ? "directory" : "file";
      if (declaredType && declaredType !== actualType) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "删除目标类型与实际文件系统类型不一致",
        });
      }

      if (actualType === "directory") {
        const childEntries = await fs.readdir(fullCurrentPath);
        if (childEntries.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `目录不为空，无法删除: ${normalizedCurrentPath}`,
          });
        }
      }

      const backupRoot = nodePath.join(
        basePath,
        `.admin-delete-rollback-${Date.now()}-${Math.random().toString(36).slice(2)}`
      );
      return {
        path: normalizedCurrentPath,
        type: actualType,
        fullCurrentPath,
        backupRoot,
        backupFullPath: nodePath.join(backupRoot, normalizedCurrentPath),
      };
    })
  );

  const committedOperations: typeof operations = [];
  const rollback = async () => {
    for (const operation of [...committedOperations].reverse()) {
      await fs.mkdir(nodePath.dirname(operation.fullCurrentPath), { recursive: true });
      await fs.rename(operation.backupFullPath, operation.fullCurrentPath).catch(() => undefined);
    }
    await Promise.all(
      committedOperations.map((operation) =>
        fs.rm(operation.backupRoot, { recursive: true, force: true })
      )
    );
  };
  const commit = async () => {
    await Promise.all(
      committedOperations.map((operation) =>
        fs.rm(operation.backupRoot, { recursive: true, force: true })
      )
    );
  };

  for (const operation of operations) {
    await fs.mkdir(nodePath.dirname(operation.backupFullPath), { recursive: true });
    await fs.rename(operation.fullCurrentPath, operation.backupFullPath);
    committedOperations.push(operation);
  }

  return {
    deleted: operations.map(({ path, type }) => ({ path, type })),
    rollback,
    commit,
  };
}

async function ensureContentSourcesRegistered(manager: ReturnType<typeof getContentSourceManager>) {
  const desiredBasePath = resolve(requireLocalBasePath());
  const desiredPathMappings = getActiveLocalPathMappings();
  const existingLocalSource = manager.getSource("local");

  if (existingLocalSource instanceof LocalContentSource) {
    if (
      !(await localSourceNeedsRefresh(existingLocalSource, desiredBasePath, desiredPathMappings))
    ) {
      return;
    }

    await manager.unregisterSource("local");
  } else if (existingLocalSource) {
    await manager.unregisterSource("local");
  }

  const localConfig = LocalContentSource.createDefaultConfig("local", 50, {
    contentPath: desiredBasePath,
    pathMappings: desiredPathMappings,
  });
  await manager.registerSource(new LocalContentSource(localConfig));
}

async function ensureSourceReady(manager: ReturnType<typeof getContentSourceManager>) {
  await ensureContentSourcesRegistered(manager);

  const source = manager.getSource("local");
  if (!source) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: '数据源 "local" 不存在',
    });
  }

  try {
    if (!(source.isReady?.() ?? false)) {
      await source.initialize();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `数据源 "local" 初始化失败：${message}`,
    });
  }

  return source;
}

export const filesRouter = createTRPCRouter({
  getSources: adminProcedure.query(async () => {
    if (!isLocalContentEnabled()) {
      return [
        {
          name: "local",
          type: "local",
          enabled: false,
          description: "本地文件系统未启用",
        } satisfies DataSource,
      ];
    }

    const manager = getContentSourceManager();
    await ensureContentSourcesRegistered(manager);

    return [
      {
        name: "local",
        type: "local",
        enabled: true,
        description: "本地文件系统",
      } satisfies DataSource,
    ];
  }),

  listDirectory: adminProcedure.input(listDirectorySchema).query(async ({ input }) => {
    const manager = getContentSourceManager();
    await ensureContentSourcesRegistered(manager);
    await ensureSourceReady(manager);

    return {
      source: input.source,
      path: input.path,
      items: await listLocalDirectory(input.path),
    };
  }),

  readFile: adminProcedure.input(readFileSchema).query(async ({ input }) => {
    const manager = getContentSourceManager();
    await ensureContentSourcesRegistered(manager);
    await ensureSourceReady(manager);

    return {
      source: input.source,
      path: input.path,
      content: await readLocalFile(input.path),
    };
  }),

  writeFile: adminProcedure.input(writeFileSchema).mutation(async ({ input }) => {
    const manager = getContentSourceManager();
    const source = await ensureSourceReady(manager);

    if (typeof (source as LocalContentSource & { writeFile?: unknown }).writeFile !== "function") {
      throw new TRPCError({
        code: "NOT_IMPLEMENTED",
        message: '数据源 "local" 不支持文件写入功能',
      });
    }

    const isMarkdown = isMarkdownContentFile(input.path);
    let contentToWrite = input.content;

    if (isMarkdown && hasApiFilesReference(contentToWrite)) {
      contentToWrite = rewriteApiFilesUrlsToRelative(contentToWrite, input.path).content;
    }

    const strict = process.env.PERSISTED_PATHS_STRICT === "1" || process.env.NODE_ENV === "test";
    if (isMarkdown && strict && hasApiFilesReference(contentToWrite)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "持久化 Markdown 不允许包含 /api/files/ 链接，请先转换为相对路径。",
      });
    }

    const writeSnapshot = await snapshotWritableLocalFile(input.path);
    await (
      source as LocalContentSource & { writeFile: (path: string, content: string) => Promise<void> }
    ).writeFile(input.path, contentToWrite);
    await syncAndCommitFileMutation(writeSnapshot);

    return {
      success: true,
      message: "文件写入成功",
      path: input.path,
    };
  }),

  createDirectory: adminProcedure.input(createDirectorySchema).mutation(async ({ input }) => {
    const manager = getContentSourceManager();
    await ensureSourceReady(manager);

    const fs = await import("node:fs/promises");
    const nodePath = await import("node:path");
    const basePath = resolve(requireLocalBasePath());
    const safePath = assertLocalPathAllowed(input.path);
    const fullPath = nodePath.join(basePath, safePath);

    try {
      await fs.mkdir(fullPath);
    } catch (error: any) {
      if (error?.code === "EEXIST") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "目标目录已存在",
        });
      }
      throw error;
    }

    await syncAndCommitFileMutation({
      rollback: async () => {
        await fs.rm(fullPath, { recursive: true, force: true });
      },
    });

    return {
      success: true,
      source: input.source,
      path: input.path,
    };
  }),

  renameFile: adminProcedure.input(renameFileSchema).mutation(async ({ input }) => {
    const manager = getContentSourceManager();
    await ensureSourceReady(manager);

    if (!input.newName.trim()) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "文件名不能为空",
      });
    }

    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(input.newName)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "文件名包含非法字符",
      });
    }

    await syncAndCommitFileMutation(await renameLocalFile(input.oldPath, input.newName));

    return {
      success: true,
      source: input.source,
      oldPath: input.oldPath,
      newName: input.newName,
    };
  }),

  moveEntries: adminProcedure.input(moveEntriesSchema).mutation(async ({ input }) => {
    const manager = getContentSourceManager();
    await ensureSourceReady(manager);

    const result = await syncAndCommitFileMutation(
      await moveLocalEntries(input.paths, input.destinationPath)
    );

    return {
      success: true,
      source: input.source,
      destinationPath: normalizeLocalBrowserPath(input.destinationPath),
      ...result,
    };
  }),

  copyEntries: adminProcedure.input(copyEntriesSchema).mutation(async ({ input }) => {
    const manager = getContentSourceManager();
    await ensureSourceReady(manager);

    const result = await syncAndCommitFileMutation(
      await copyLocalEntries(input.paths, input.destinationPath)
    );

    return {
      success: true,
      source: input.source,
      destinationPath: normalizeLocalBrowserPath(input.destinationPath),
      ...result,
    };
  }),

  deleteEntries: adminProcedure.input(deleteEntriesSchema).mutation(async ({ input }) => {
    const manager = getContentSourceManager();
    await ensureSourceReady(manager);

    const result = await syncAndCommitFileMutation(await deleteLocalEntries(input.entries));

    return {
      success: true,
      source: input.source,
      ...result,
    };
  }),
});
