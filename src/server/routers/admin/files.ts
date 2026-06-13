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
  destinationPath: z.string().default(""),
});

const copyEntriesSchema = z.object({
  source: z.literal("local").default("local"),
  paths: z.array(z.string().min(1)).min(1),
  destinationPath: z.string().default(""),
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

type BatchEntryResult = {
  path: string;
  nextPath?: string;
  type: "file" | "directory";
};

function isMarkdownContentFile(path: string) {
  const lowerPath = path.toLowerCase();
  return lowerPath.endsWith(".md") || lowerPath.endsWith(".markdown");
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

  if (!isPathWithinConfiguredRoots(normalizedPath, getActiveLocalPathMappings())) {
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

async function ensureLocalDirectoryTarget(
  destinationPath: string
): Promise<{ relativePath: string; fullPath: string }> {
  const fs = await import("node:fs/promises");
  const nodePath = await import("node:path");
  const basePath = resolve(requireLocalBasePath());
  const normalizedRelativePath = destinationPath ? assertLocalPathAllowed(destinationPath) : "";
  const fullPath = normalizedRelativePath
    ? nodePath.join(basePath, normalizedRelativePath)
    : basePath;

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

async function triggerAdminContentSync(): Promise<string | undefined> {
  console.log("🔄 [Files API] 准备触发增量数据同步...");
  try {
    const syncManager = getContentSourceManager({
      maxConcurrentSyncs: 2,
      syncTimeout: 30000,
      enableTransactions: true,
      conflictResolution: "priority",
    });
    const result = await syncManager.syncAll();
    if (result.success) {
      console.log(`✅ [Files API] 增量同步完成，处理了 ${result.stats.totalProcessed} 个项目`);
      return undefined;
    } else {
      const errorMessages = result.errors.map((entry) => entry.message).join(", ");
      console.warn(`⚠️ [Files API] 增量同步失败: ${errorMessages}`);
      return errorMessages ? `增量同步失败：${errorMessages}` : "增量同步失败";
    }
  } catch (syncError) {
    console.error("❌ [Files API] 增量数据同步异常:", syncError);
    return syncError instanceof Error ? syncError.message : "增量同步失败";
  }
}

/**
 * 列出本地目录内容
 */
async function listLocalDirectory(path: string): Promise<FileItem[]> {
  try {
    const fs = await import("node:fs/promises");
    const nodePath = await import("node:path");

    // 构建完整路径（使用配置的本地内容根路径）
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

      console.log(`📂 [Files API] 本地根目录找到 ${rootItems.length} 个配置目录`);
      return rootItems;
    }

    const safePath = assertLocalPathAllowed(normalizedPath);
    const fullPath = nodePath.join(basePath, safePath);

    console.log("📂 [Files API] 列出本地目录:", { path: safePath, fullPath });

    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    const items: FileItem[] = [];

    for (const entry of entries) {
      const itemPath = nodePath.join(safePath, entry.name);
      const fullItemPath = nodePath.join(fullPath, entry.name);

      if (entry.isDirectory()) {
        // 获取目录内的项目数量
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
      } else if (entry.isFile()) {
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

    console.log(`📂 [Files API] 本地目录找到 ${items.length} 个项目`);
    return items;
  } catch (error) {
    console.error("❌ [Files API] 本地目录列表失败:", error);
    throw error;
  }
}

/**
 * 读取本地文件内容
 */
async function readLocalFile(path: string): Promise<string> {
  try {
    const fs = await import("node:fs/promises");
    const nodePath = await import("node:path");

    // 构建完整路径（使用配置的本地内容根路径）
    const basePath = resolve(requireLocalBasePath());
    const safePath = assertLocalPathAllowed(path);
    const fullPath = nodePath.join(basePath, safePath);

    console.log("📖 [Files API] 读取本地文件:", { path: safePath, fullPath });

    const content = await fs.readFile(fullPath, "utf-8");

    console.log(`📖 [Files API] 本地文件读取成功，长度: ${content.length}`);
    return content;
  } catch (error) {
    console.error("❌ [Files API] 本地文件读取失败:", error);
    throw error;
  }
}

/**
 * 重命名本地文件或目录
 */
async function renameLocalFile(oldPath: string, newName: string): Promise<void> {
  try {
    const fs = await import("node:fs/promises");
    const nodePath = await import("node:path");

    // 构建完整路径（使用配置的本地内容根路径）
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

    // 构建新路径
    const pathParts = safeOldPath.split("/");
    pathParts[pathParts.length - 1] = newName;
    const newPath = pathParts.join("/");
    const fullNewPath = nodePath.join(basePath, newPath);

    // 检查新路径是否已存在
    try {
      await fs.access(fullNewPath);
      throw new TRPCError({
        code: "CONFLICT",
        message: "目标文件或目录已存在",
      });
    } catch (error: any) {
      // 如果文件不存在，这是我们期望的结果
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    // 执行重命名
    await fs.rename(fullOldPath, fullNewPath);
    await rebaseMovedMarkdownLinks(fullNewPath, safeOldPath, newPath, nodePath);

    console.log(`✅ [Files API] 本地文件重命名成功: ${fullOldPath} -> ${fullNewPath}`);
  } catch (error) {
    console.error("❌ [Files API] 本地文件重命名失败:", error);
    throw error;
  }
}

async function rebaseMovedMarkdownLinks(
  fullPath: string,
  oldRelativePath: string,
  newRelativePath: string,
  nodePath: typeof import("node:path")
) {
  const fs = await import("node:fs/promises");
  const stats = await fs.stat(fullPath).catch(() => null);
  if (!stats) return;

  if (stats.isFile()) {
    if (!isMarkdownContentFile(fullPath)) return;
    const currentContent = await fs.readFile(fullPath, "utf-8");
    const rebased = rebasePersistedLocalLinks(currentContent, oldRelativePath, newRelativePath);
    if (rebased.changed) {
      await fs.writeFile(fullPath, rebased.content, "utf-8");
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
      await rebaseMovedMarkdownLinks(childFullPath, oldChildPath, newChildPath, nodePath);
    })
  );
}

async function moveLocalEntries(
  paths: string[],
  destinationPath: string
): Promise<{ moved: BatchEntryResult[] }> {
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

  for (const operation of operations) {
    await fs.rename(operation.fullCurrentPath, operation.fullNextPath);
    await rebaseMovedMarkdownLinks(
      operation.fullNextPath,
      operation.path,
      operation.nextPath,
      nodePath
    );
  }

  return {
    moved: operations.map(({ path, nextPath, type }) => ({ path, nextPath, type })),
  };
}

async function copyLocalEntries(
  paths: string[],
  destinationPath: string
): Promise<{ copied: BatchEntryResult[] }> {
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

  for (const operation of operations) {
    await fs.cp(operation.fullCurrentPath, operation.fullNextPath, {
      recursive: operation.type === "directory",
      errorOnExist: true,
      force: false,
    });
  }

  return {
    copied: operations.map(({ path, nextPath, type }) => ({ path, nextPath, type })),
  };
}

async function deleteLocalEntries(
  entries: Array<{ path: string; type: "file" | "directory" }>
): Promise<{ deleted: BatchEntryResult[] }> {
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

      return {
        path: normalizedCurrentPath,
        type: actualType,
        fullCurrentPath,
      };
    })
  );

  for (const operation of operations) {
    if (operation.type === "directory") {
      await fs.rmdir(operation.fullCurrentPath);
    } else {
      await fs.unlink(operation.fullCurrentPath);
    }
  }

  return {
    deleted: operations.map(({ path, type }) => ({ path, type })),
  };
}

/**
 * 确保内容源已注册
 */
async function ensureContentSourcesRegistered(manager: ReturnType<typeof getContentSourceManager>) {
  const sources = manager.getSources();

  const hasLocal = sources.some((source) => source.name === "local");

  if (!hasLocal) {
    const basePath = requireLocalBasePath();
    const localConfig = LocalContentSource.createDefaultConfig("local", 50, {
      contentPath: resolve(basePath),
      pathMappings: getActiveLocalPathMappings(),
    });
    await manager.registerSource(new LocalContentSource(localConfig));
  }
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
  /**
   * 获取所有可用的数据源
   */
  getSources: adminProcedure.query(async () => {
    try {
      const manager = getContentSourceManager();

      // 确保内容源已注册
      await ensureContentSourcesRegistered(manager);

      return [
        {
          name: "local",
          type: "local",
          enabled: true,
          description: "本地文件系统",
        } satisfies DataSource,
      ];
    } catch (error) {
      console.error("❌ [Files API] 获取数据源失败:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "获取数据源失败",
      });
    }
  }),

  /**
   * 列出指定数据源和路径下的文件和目录
   */
  listDirectory: adminProcedure.input(listDirectorySchema).query(async ({ input }) => {
    try {
      const manager = getContentSourceManager();

      // 确保内容源已注册
      await ensureContentSourcesRegistered(manager);

      await ensureSourceReady(manager);

      const items = await listLocalDirectory(input.path);

      return {
        source: input.source,
        path: input.path,
        items,
      };
    } catch (error) {
      console.error("❌ [Files API] 列出目录失败:", error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "列出目录失败",
      });
    }
  }),

  /**
   * 读取文件内容
   */
  readFile: adminProcedure.input(readFileSchema).query(async ({ input }) => {
    try {
      const manager = getContentSourceManager();

      // 确保内容源已注册
      await ensureContentSourcesRegistered(manager);

      await ensureSourceReady(manager);

      const content = await readLocalFile(input.path);

      return {
        source: input.source,
        path: input.path,
        content,
      };
    } catch (error) {
      console.error("❌ [Files API] 读取文件失败:", error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "读取文件失败",
      });
    }
  }),

  /**
   * 写入文件内容
   */
  writeFile: adminProcedure.input(writeFileSchema).mutation(async ({ input }) => {
    try {
      console.log(`📝 [Files API] 开始写入文件: ${input.source}:${input.path}`);
      console.log(`📝 [Files API] 内容长度: ${input.content.length}`);
      console.log(`📝 [Files API] 内容预览: ${input.content.substring(0, 200)}...`);

      const manager = getContentSourceManager();
      const source = await ensureSourceReady(manager);

      // 检查内容源是否支持写入功能
      if (typeof (source as any).writeFile !== "function") {
        throw new TRPCError({
          code: "NOT_IMPLEMENTED",
          message: '数据源 "local" 不支持文件写入功能',
        });
      }

      const isMarkdown = isMarkdownContentFile(input.path);
      let contentToWrite = input.content;

      // Final gate: persisted markdown must not contain `/api/files/...` links.
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

      // 调用内容源的写入方法
      await (source as any).writeFile(input.path, contentToWrite);

      console.log(`✅ [Files API] 文件写入成功: ${input.source}:${input.path}`);

      // 触发增量数据同步
      const syncWarning = await triggerAdminContentSync();
      console.log("🏁 [Files API] 增量同步流程结束");

      return {
        success: true,
        message: "文件写入成功",
        path: input.path,
        syncWarning,
      };
    } catch (error) {
      console.error("❌ [Files API] 写入文件失败:", error);

      // 如果是已知的 TRPCError，直接抛出
      if (error instanceof TRPCError) {
        throw error;
      }

      // 否则包装为通用错误
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "写入文件失败",
      });
    }
  }),

  /**
   * 创建目录
   */
  createDirectory: adminProcedure.input(createDirectorySchema).mutation(async ({ input }) => {
    try {
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

      const syncWarning = await triggerAdminContentSync();

      return {
        success: true,
        source: input.source,
        path: input.path,
        syncWarning,
      };
    } catch (error) {
      console.error("创建目录失败:", error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "创建目录失败",
      });
    }
  }),

  /**
   * 重命名文件或目录
   */
  renameFile: adminProcedure.input(renameFileSchema).mutation(async ({ input }) => {
    try {
      const manager = getContentSourceManager();
      await ensureSourceReady(manager);

      // 验证新名称
      if (!input.newName.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "文件名不能为空",
        });
      }

      // 检查新名称是否包含非法字符
      const invalidChars = /[<>:"/\\|?*]/;
      if (invalidChars.test(input.newName)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "文件名包含非法字符",
        });
      }

      await renameLocalFile(input.oldPath, input.newName);
      const syncWarning = await triggerAdminContentSync();

      return {
        success: true,
        source: input.source,
        oldPath: input.oldPath,
        newName: input.newName,
        syncWarning,
      };
    } catch (error) {
      console.error("❌ [Files API] 重命名文件失败:", error);

      // 如果是已知的 TRPCError，直接抛出
      if (error instanceof TRPCError) {
        throw error;
      }

      // 否则包装为通用错误
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "重命名文件失败",
      });
    }
  }),

  moveEntries: adminProcedure.input(moveEntriesSchema).mutation(async ({ input }) => {
    try {
      if (input.source !== "local") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "当前仅支持本地内容源的移动操作",
        });
      }

      const manager = getContentSourceManager();
      const source = await ensureSourceReady(manager);
      if (!(source instanceof LocalContentSource)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "当前内容源不支持移动操作",
        });
      }

      const result = await moveLocalEntries(input.paths, input.destinationPath);
      const syncWarning = await triggerAdminContentSync();
      return {
        success: true,
        source: input.source,
        destinationPath: input.destinationPath,
        moved: result.moved,
        syncWarning,
      };
    } catch (error) {
      console.error("移动文件失败:", error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "移动文件失败",
      });
    }
  }),

  copyEntries: adminProcedure.input(copyEntriesSchema).mutation(async ({ input }) => {
    try {
      if (input.source !== "local") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "当前仅支持本地内容源的复制操作",
        });
      }

      const manager = getContentSourceManager();
      const source = await ensureSourceReady(manager);
      if (!(source instanceof LocalContentSource)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "当前内容源不支持复制操作",
        });
      }

      const result = await copyLocalEntries(input.paths, input.destinationPath);
      const syncWarning = await triggerAdminContentSync();
      return {
        success: true,
        source: input.source,
        destinationPath: input.destinationPath,
        copied: result.copied,
        syncWarning,
      };
    } catch (error) {
      console.error("复制文件失败:", error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "复制文件失败",
      });
    }
  }),

  deleteEntries: adminProcedure.input(deleteEntriesSchema).mutation(async ({ input }) => {
    try {
      if (input.source !== "local") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "当前仅支持本地内容源的删除操作",
        });
      }

      const manager = getContentSourceManager();
      const source = await ensureSourceReady(manager);
      if (!(source instanceof LocalContentSource)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "当前内容源不支持删除操作",
        });
      }

      const result = await deleteLocalEntries(input.entries);
      const syncWarning = await triggerAdminContentSync();
      return {
        success: true,
        source: input.source,
        deleted: result.deleted,
        syncWarning,
      };
    } catch (error) {
      console.error("删除文件失败:", error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "删除文件失败",
      });
    }
  }),
});
