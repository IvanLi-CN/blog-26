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
import { hasApiFilesReference, rewriteApiFilesUrlsToRelative } from "@/lib/persisted-paths";
import { isLocalContentEnabled, LOCAL_PATH_MAPPINGS, LOCAL_PATHS } from "../../../config/paths";
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

function requireLocalBasePath(): string {
  if (!isLocalContentEnabled()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "本地内容源未启用",
    });
  }
  const basePath = LOCAL_PATHS.basePath;
  if (!basePath) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "本地内容根路径未配置",
    });
  }
  return basePath;
}

function getLocalConfiguredRootDirs(): string[] {
  return getConfiguredContentRootDirs(LOCAL_PATH_MAPPINGS);
}

function normalizeLocalBrowserPath(path: string): string {
  return normalizeRelativeContentPath(path || "");
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

  if (!isPathWithinConfiguredRoots(normalizedPath, LOCAL_PATH_MAPPINGS)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `路径不在已配置的本地内容根目录内: ${normalizedPath}`,
    });
  }

  return normalizedPath;
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

async function renameLocalFile(oldPath: string, newName: string): Promise<void> {
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

  await fs.rename(fullOldPath, fullNewPath);
}

async function ensureContentSourcesRegistered(manager: ReturnType<typeof getContentSourceManager>) {
  const hasLocal = manager.getSources().some((source) => source.name === "local");
  if (hasLocal) {
    return;
  }

  const basePath = requireLocalBasePath();
  const localConfig = LocalContentSource.createDefaultConfig("local", 50, {
    contentPath: resolve(basePath),
    pathMappings: LOCAL_PATH_MAPPINGS,
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

    const isMarkdown =
      input.path.toLowerCase().endsWith(".md") || input.path.toLowerCase().endsWith(".markdown");
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

    await (
      source as LocalContentSource & { writeFile: (path: string, content: string) => Promise<void> }
    ).writeFile(input.path, contentToWrite);

    const syncManager = getContentSourceManager({
      maxConcurrentSyncs: 2,
      syncTimeout: 30000,
      enableTransactions: true,
      conflictResolution: "priority",
    });
    await syncManager.syncAll();

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

    return {
      success: true,
      source: input.source,
      path: input.path,
    };
  }),

  renameFile: adminProcedure.input(renameFileSchema).mutation(async ({ input }) => {
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

    await renameLocalFile(input.oldPath, input.newName);

    return {
      success: true,
      source: input.source,
      oldPath: input.oldPath,
      newName: input.newName,
    };
  }),
});
