/**
 * 文件管理 tRPC 路由
 *
 * 提供对多数据源（WebDAV、Local）的文件操作接口
 */

import { resolve } from "node:path";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getContentSourceManager,
  LocalContentSource,
  WebDAVContentSource,
} from "../../../lib/content-sources";
import { getWebDAVClient, isWebDAVEnabled } from "../../../lib/webdav";
import { adminProcedure, createTRPCRouter } from "../../trpc";

// 输入验证 Schema
const listDirectorySchema = z.object({
  source: z.string().min(1), // 数据源名称，如 "webdav" 或 "local"
  path: z.string().default(""), // 目录路径，默认为根目录
});

const readFileSchema = z.object({
  source: z.string().min(1),
  path: z.string().min(1),
});

const writeFileSchema = z.object({
  source: z.string().min(1),
  path: z.string().min(1),
  content: z.string(),
});

const createDirectorySchema = z.object({
  source: z.string().min(1),
  path: z.string().min(1),
});

const renameFileSchema = z.object({
  source: z.string().min(1),
  oldPath: z.string().min(1),
  newName: z.string().min(1),
});

// 文件/目录项类型
export interface FileItem {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  lastModified?: Date;
  extension?: string;
  count?: number;
}

// 数据源信息类型
export interface DataSource {
  name: string;
  type: "webdav" | "local";
  enabled: boolean;
  description?: string;
}

/**
 * 列出 WebDAV 目录内容
 */
async function listWebDAVDirectory(path: string): Promise<FileItem[]> {
  if (!isWebDAVEnabled()) {
    throw new Error("WebDAV 未启用");
  }

  try {
    const webdavClient = getWebDAVClient();
    const webdavPath = path || "/";

    const files = await webdavClient.listFiles(webdavPath, false);

    const items: FileItem[] = [];

    for (const file of files) {
      // 过滤掉当前目录本身（避免重复显示）
      if (file.filename === webdavPath) {
        continue;
      }

      const item: FileItem = {
        name: file.basename,
        path: file.filename,
        type: file.type === "directory" ? "directory" : "file",
        size: file.size,
        lastModified: file.lastmod ? new Date(file.lastmod) : undefined,
        extension: file.type === "file" ? file.basename.split(".").pop() : undefined,
      };

      // 如果是目录，获取目录内的项目数量
      if (file.type === "directory") {
        try {
          const subFiles = await webdavClient.listFiles(file.filename, false);
          // 过滤掉子目录中的当前目录本身
          const filteredSubFiles = subFiles.filter((subFile) => subFile.filename !== file.filename);
          item.count = filteredSubFiles.length;
        } catch (error) {
          console.warn(`⚠️ [Files API] 无法获取目录 ${file.filename} 的项目数量:`, error);
          item.count = 0;
        }
      }

      items.push(item);
    }

    return items;
  } catch (error) {
    console.error("❌ [Files API] WebDAV 目录列表失败:", error);
    throw error;
  }
}

/**
 * 列出本地目录内容
 */
async function listLocalDirectory(path: string): Promise<FileItem[]> {
  try {
    const fs = await import("node:fs/promises");
    const nodePath = await import("node:path");

    // 构建完整路径
    const basePath = resolve("./dev-data/local");
    const fullPath = nodePath.join(basePath, path || "");

    console.log("📂 [Files API] 列出本地目录:", { path, fullPath });

    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    const items: FileItem[] = [];

    for (const entry of entries) {
      const itemPath = nodePath.join(path || "", entry.name);
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
 * 读取 WebDAV 文件内容
 */
async function readWebDAVFile(path: string): Promise<string> {
  if (!isWebDAVEnabled()) {
    throw new Error("WebDAV 未启用");
  }

  try {
    const webdavClient = getWebDAVClient();
    const content = await webdavClient.getFileContent(path);

    if (typeof content === "string") {
      return content;
    } else {
      // 如果是 Buffer，转换为字符串
      return (content as Buffer).toString("utf-8");
    }
  } catch (error) {
    console.error("❌ [Files API] WebDAV 文件读取失败:", error);
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

    // 构建完整路径
    const basePath = resolve("./dev-data/local");
    const fullPath = nodePath.join(basePath, path);

    console.log("📖 [Files API] 读取本地文件:", { path, fullPath });

    const content = await fs.readFile(fullPath, "utf-8");

    console.log(`📖 [Files API] 本地文件读取成功，长度: ${content.length}`);
    return content;
  } catch (error) {
    console.error("❌ [Files API] 本地文件读取失败:", error);
    throw error;
  }
}

/**
 * 重命名WebDAV文件或目录
 */
async function renameWebDAVFile(oldPath: string, newName: string): Promise<void> {
  try {
    const client = getWebDAVClient();
    if (!client) {
      throw new Error("WebDAV客户端未初始化");
    }

    // 构建新路径
    const pathParts = oldPath.split("/");
    pathParts[pathParts.length - 1] = newName;
    const newPath = pathParts.join("/");

    // 检查新路径是否已存在
    const exists = await client.exists(newPath);
    if (exists) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "目标文件或目录已存在",
      });
    }

    // 执行重命名（WebDAV中使用MOVE方法）
    await client.moveFile(oldPath, newPath);

    console.log(`✅ [Files API] WebDAV文件重命名成功: ${oldPath} -> ${newPath}`);
  } catch (error) {
    console.error("❌ [Files API] WebDAV文件重命名失败:", error);
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

    // 构建完整路径
    const basePath = resolve("./dev-data/local");
    const fullOldPath = nodePath.join(basePath, oldPath);

    // 构建新路径
    const pathParts = oldPath.split("/");
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

    console.log(`✅ [Files API] 本地文件重命名成功: ${fullOldPath} -> ${fullNewPath}`);
  } catch (error) {
    console.error("❌ [Files API] 本地文件重命名失败:", error);
    throw error;
  }
}

/**
 * 确保内容源已注册
 */
async function ensureContentSourcesRegistered(manager: ReturnType<typeof getContentSourceManager>) {
  const sources = manager.getSources();

  // 如果没有注册的内容源，自动注册默认的内容源
  if (sources.length === 0) {
    console.log("🔧 [Files API] 自动注册默认内容源...");

    // 注册本地内容源
    const localConfig = LocalContentSource.createDefaultConfig("local", 50, {
      contentPath: resolve("./dev-data/local"),
    });
    const localSource = new LocalContentSource(localConfig);
    await manager.registerSource(localSource);
    console.log("✅ [Files API] 本地内容源注册成功");

    // 如果 WebDAV 可用，注册 WebDAV 内容源
    if (isWebDAVEnabled()) {
      try {
        const webdavConfig = WebDAVContentSource.createDefaultConfig("webdav", 100);
        const webdavSource = new WebDAVContentSource(webdavConfig);
        await manager.registerSource(webdavSource);
        console.log("✅ [Files API] WebDAV 内容源注册成功");
      } catch (error) {
        console.warn("⚠️ [Files API] WebDAV 内容源注册失败:", error);
      }
    }
  }
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

      const sources = manager.getSources();

      console.log("📋 [Files API] 获取数据源:", sources.length);

      return sources.map((source): DataSource => {
        const sourceType = source.type || "unknown";
        return {
          name: source.name,
          type: sourceType as "webdav" | "local",
          enabled: source.enabled,
          description:
            sourceType === "webdav"
              ? `${process.env.WEBDAV_URL || "WebDAV服务器"} ${source.enabled ? "(已连接)" : "(未连接)"}`
              : `本地文件系统 (本地路径)`,
        };
      });
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

      const source = manager.getSource(input.source);

      if (!source) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `数据源 "${input.source}" 不存在`,
        });
      }

      console.log(`📂 [Files API] 列出目录: ${input.source}:${input.path}`);

      let items: FileItem[] = [];

      // 根据数据源类型调用相应的方法
      if (source.type === "webdav") {
        items = await listWebDAVDirectory(input.path);
      } else if (source.type === "local") {
        items = await listLocalDirectory(input.path);
      }

      console.log(`📂 [Files API] 找到 ${items.length} 个项目`);

      return {
        source: input.source,
        path: input.path,
        items,
      };
    } catch (error) {
      console.error("❌ [Files API] 列出目录失败:", error);
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

      const source = manager.getSource(input.source);

      if (!source) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `数据源 "${input.source}" 不存在`,
        });
      }

      console.log(`📖 [Files API] 读取文件: ${input.source}:${input.path}`);

      let content = "";

      // 根据数据源类型调用相应的方法
      if (source.type === "webdav") {
        content = await readWebDAVFile(input.path);
      } else if (source.type === "local") {
        content = await readLocalFile(input.path);
      }

      console.log(`📖 [Files API] 文件读取成功，长度: ${content.length}`);

      return {
        source: input.source,
        path: input.path,
        content,
      };
    } catch (error) {
      console.error("❌ [Files API] 读取文件失败:", error);
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
      const source = manager.getSource(input.source);

      if (!source) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `数据源 "${input.source}" 不存在`,
        });
      }

      // 检查内容源是否支持写入功能
      if (typeof (source as any).writeFile !== "function") {
        throw new TRPCError({
          code: "NOT_IMPLEMENTED",
          message: `数据源 "${input.source}" 不支持文件写入功能`,
        });
      }

      // 调用内容源的写入方法
      await (source as any).writeFile(input.path, input.content);

      console.log(`✅ [Files API] 文件写入成功: ${input.source}:${input.path}`);

      // 触发增量数据同步
      console.log("🔄 [Files API] 准备触发增量数据同步...");
      try {
        console.log("🔄 [Files API] 开始触发增量数据同步...");

        console.log("🔧 [Files API] 创建同步管理器...");
        const syncManager = getContentSourceManager({
          maxConcurrentSyncs: 2,
          syncTimeout: 30000, // 30秒超时
          enableTransactions: true,
          conflictResolution: "priority",
        });
        console.log("✅ [Files API] 同步管理器创建成功");

        console.log("🚀 [Files API] 执行 syncAll()...");
        const result = await syncManager.syncAll();
        console.log("📊 [Files API] syncAll() 执行完成，结果:", result);

        if (result.success) {
          console.log(`✅ [Files API] 增量同步完成，处理了 ${result.stats.totalProcessed} 个项目`);
        } else {
          const errorMessages = result.errors.map((e) => e.message).join(", ");
          console.warn(`⚠️ [Files API] 增量同步失败: ${errorMessages}`);
        }
      } catch (syncError) {
        // 同步失败不应该影响文件写入的成功响应，但需要记录错误
        console.error("❌ [Files API] 增量数据同步异常:", syncError);
        console.error(
          "❌ [Files API] 异常堆栈:",
          syncError instanceof Error ? syncError.stack : "无堆栈信息"
        );
      }
      console.log("🏁 [Files API] 增量同步流程结束");

      return {
        success: true,
        message: "文件写入成功",
        path: input.path,
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
      const source = manager.getSource(input.source);

      if (!source) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `数据源 "${input.source}" 不存在`,
        });
      }

      // TODO: 实现具体的目录创建逻辑
      // await source.createDirectory(input.path);

      return {
        success: true,
        source: input.source,
        path: input.path,
      };
    } catch (error) {
      console.error("创建目录失败:", error);
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

      // 确保内容源已注册
      await ensureContentSourcesRegistered(manager);

      const source = manager.getSource(input.source);

      if (!source) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `数据源 "${input.source}" 不存在`,
        });
      }

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

      // 根据数据源类型执行重命名
      if (source instanceof WebDAVContentSource) {
        await renameWebDAVFile(input.oldPath, input.newName);
      } else if (source instanceof LocalContentSource) {
        await renameLocalFile(input.oldPath, input.newName);
      } else {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "不支持的数据源类型",
        });
      }

      return {
        success: true,
        source: input.source,
        oldPath: input.oldPath,
        newName: input.newName,
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
});
