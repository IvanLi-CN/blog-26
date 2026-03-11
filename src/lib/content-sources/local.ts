/**
 * 本地文件系统内容源实现
 *
 * 支持从本地文件系统读取 Markdown 文件并解析为内容项
 */

import { promises as fs } from "node:fs";
import { join, relative, resolve } from "node:path";
import { LOCAL_PATH_MAPPINGS } from "@/config/paths";
import {
  type ContentPathMappings,
  getConfiguredContentRootDirs,
  isPathWithinConfiguredRoots,
  normalizeRelativeContentPath,
} from "@/lib/content-path-mappings";
import { ContentSourceBase } from "./base";
import type { ContentItem, ContentSourceConfig, ContentSourceStatus, FileInfo } from "./types";
import {
  createContentItemFromParsed,
  isMarkdownFile,
  normalizePath,
  parseMarkdownContent,
  sanitizeContentItem,
  validateContentItem,
} from "./utils";

/**
 * 本地内容源选项
 */
export interface LocalContentSourceOptions extends Record<string, unknown> {
  /** 内容根目录路径 */
  contentPath: string;
  /** 是否递归扫描子目录 */
  recursive?: boolean;
  /** 排除的路径模式 */
  excludePatterns?: string[];
  /** 是否监听文件变更 */
  watchChanges?: boolean;
  /** 内容类型到真实目录的映射 */
  pathMappings?: ContentPathMappings;
}

/**
 * 本地内容源配置
 */
export interface LocalContentSourceConfig extends ContentSourceConfig {
  options: LocalContentSourceOptions;
}

/**
 * 本地文件系统内容源
 */
export class LocalContentSource extends ContentSourceBase {
  private contentPath: string;
  private recursive: boolean;
  private excludePatterns: string[];
  private watchChanges: boolean;
  private pathMappings: Required<ContentPathMappings>;
  private configuredRootDirs: string[];
  private fileCache = new Map<string, FileInfo>();

  constructor(config: LocalContentSourceConfig) {
    super(config, "local");

    const {
      contentPath,
      recursive = true,
      excludePatterns = [],
      watchChanges = false,
      pathMappings = {},
    } = config.options;

    this.contentPath = resolve(contentPath);
    this.recursive = recursive;
    this.excludePatterns = excludePatterns;
    this.watchChanges = watchChanges;
    this.pathMappings = {
      posts: [...(pathMappings.posts || LOCAL_PATH_MAPPINGS.posts)],
      projects: [...(pathMappings.projects || LOCAL_PATH_MAPPINGS.projects)],
      memos: [...(pathMappings.memos || LOCAL_PATH_MAPPINGS.memos)],
    };
    this.configuredRootDirs = getConfiguredContentRootDirs(this.pathMappings);
  }

  // ============================================================================
  // IContentSource 接口实现
  // ============================================================================

  async initialize(): Promise<void> {
    this.log("info", `初始化本地内容源: ${this.contentPath}`);

    try {
      // 检查内容目录是否存在
      const stats = await fs.stat(this.contentPath);
      if (!stats.isDirectory()) {
        throw new Error(`内容路径不是目录: ${this.contentPath}`);
      }

      // 初始化文件缓存
      await this.refreshFileCache();

      this.isInitialized = true;
      this.log("info", `本地内容源初始化成功，发现 ${this.fileCache.size} 个文件`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log("error", `本地内容源初始化失败: ${errorMessage}`);
      throw error;
    }
  }

  async listContent(): Promise<ContentItem[]> {
    this.ensureInitialized();

    this.log("info", "开始扫描本地内容文件");

    const contentItems: ContentItem[] = [];
    const markdownFiles = Array.from(this.fileCache.values()).filter(
      (file) => !file.isDirectory && isMarkdownFile(file.path)
    );

    for (const fileInfo of markdownFiles) {
      try {
        const relativePath = this.getRelativePath(fileInfo.path);

        // 检查是否应该排除此文件
        if (this.shouldExcludeFile(relativePath)) {
          this.log("debug", `跳过排除的文件: ${relativePath}`);
          continue;
        }

        const rawContent = await fs.readFile(fileInfo.path, "utf-8");
        const parsed = parseMarkdownContent(rawContent, relativePath);
        const contentItem = createContentItemFromParsed(parsed, relativePath, this.name, {
          pathMappings: this.pathMappings,
        });

        // 更新文件系统相关的字段
        contentItem.lastModified = fileInfo.lastModified;

        // 验证和清理内容项
        if (validateContentItem(contentItem)) {
          contentItems.push(sanitizeContentItem(contentItem));
        } else {
          this.log("warn", `内容项验证失败，跳过: ${relativePath}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.log("error", `处理文件失败: ${fileInfo.path}`, fileInfo.path, { error: errorMessage });
      }
    }

    this.log("info", `本地内容扫描完成，处理了 ${contentItems.length} 个有效文件`);
    return contentItems;
  }

  async getContent(filePath: string): Promise<string> {
    this.ensureInitialized();

    const fullPath = this.resolveContentPath(filePath);

    try {
      const content = await fs.readFile(fullPath, "utf-8");
      this.log("debug", `读取文件内容: ${filePath}`);
      return content;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log("error", `读取文件失败: ${filePath}`, filePath, { error: errorMessage });
      throw new Error(`无法读取文件 ${filePath}: ${errorMessage}`);
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.ensureInitialized();

    const fullPath = this.resolveContentPath(filePath);

    try {
      // 确保目录存在
      const { dirname } = await import("node:path");
      const dirPath = dirname(fullPath);
      await fs.mkdir(dirPath, { recursive: true });

      // 写入文件
      await fs.writeFile(fullPath, content, "utf-8");
      this.log("info", `写入文件成功: ${filePath}`);

      // 更新文件缓存
      const stats = await fs.stat(fullPath);
      const normalizedRelativePath = this.getRelativePath(fullPath);
      const extension = normalizedRelativePath.split(".").pop()?.toLowerCase() || "";
      const fileName = normalizedRelativePath.split("/").pop() || "";

      this.fileCache.set(fullPath, {
        path: fullPath,
        name: fileName,
        extension,
        size: stats.size,
        lastModified: stats.mtimeMs,
        isDirectory: false,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log("error", `写入文件失败: ${filePath}`, filePath, { error: errorMessage });
      throw new Error(`无法写入文件 ${filePath}: ${errorMessage}`);
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      const stats = await fs.stat(this.contentPath);
      if (!stats.isDirectory()) {
        throw new Error(`内容路径不是目录: ${this.contentPath}`);
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 抛出错误以便上层 getStatus() 捕获并回填到 UI 的 error 字段
      throw new Error(`本地内容源不可用: ${message}`);
    }
  }

  protected async getSourceSpecificStatus(): Promise<Partial<ContentSourceStatus>> {
    const markdownFiles = Array.from(this.fileCache.values()).filter(
      (file) => !file.isDirectory && isMarkdownFile(file.path)
    );

    return {
      totalItems: markdownFiles.length,
      metadata: {
        contentPath: this.contentPath,
        recursive: this.recursive,
        excludePatterns: this.excludePatterns,
        watchChanges: this.watchChanges,
        cachedFiles: this.fileCache.size,
        configuredRootDirs: this.configuredRootDirs,
        pathMappings: this.pathMappings,
      },
    };
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 刷新文件缓存
   */
  private async refreshFileCache(): Promise<void> {
    this.fileCache.clear();

    const rootsToScan = this.configuredRootDirs.length > 0 ? this.configuredRootDirs : [""];
    for (const rootDir of rootsToScan) {
      const absoluteRoot = rootDir ? join(this.contentPath, rootDir) : this.contentPath;
      try {
        const stats = await fs.stat(absoluteRoot);
        if (!stats.isDirectory()) {
          continue;
        }
        await this.scanDirectory(absoluteRoot);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.log("debug", `跳过不存在的本地内容根目录: ${rootDir || "/"}`, undefined, {
          error: errorMessage,
        });
      }
    }
  }

  /**
   * 递归扫描目录
   */
  private async scanDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        const relativePath = this.getRelativePath(fullPath);

        // 检查是否应该排除
        if (this.shouldExcludeFile(relativePath)) {
          continue;
        }

        if (entry.isDirectory()) {
          // 添加目录到缓存
          this.fileCache.set(fullPath, {
            path: fullPath,
            name: entry.name,
            extension: "",
            size: 0,
            lastModified: 0,
            isDirectory: true,
          });

          // 递归扫描子目录
          if (this.recursive) {
            await this.scanDirectory(fullPath);
          }
        } else if (entry.isFile()) {
          // 获取文件信息
          const stats = await fs.stat(fullPath);
          const extension = entry.name.split(".").pop()?.toLowerCase() || "";

          this.fileCache.set(fullPath, {
            path: fullPath,
            name: entry.name,
            extension,
            size: stats.size,
            lastModified: stats.mtimeMs,
            isDirectory: false,
          });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log("warn", `扫描目录失败: ${dirPath}`, undefined, { error: errorMessage });
    }
  }

  /**
   * 获取相对路径
   */
  private getRelativePath(fullPath: string): string {
    return normalizePath(relative(this.contentPath, fullPath));
  }

  /**
   * 解析内容路径
   */
  private resolveContentPath(filePath: string): string {
    const relativePath = filePath.startsWith(this.contentPath)
      ? this.getRelativePath(filePath)
      : normalizeRelativeContentPath(filePath);
    const normalizedRelativePath = this.assertAllowedRelativePath(relativePath);
    return resolve(this.contentPath, normalizedRelativePath);
  }

  private assertAllowedRelativePath(filePath: string): string {
    const normalizedRelativePath = normalizeRelativeContentPath(filePath);
    if (!normalizedRelativePath) {
      throw new Error("文件路径不能为空");
    }

    if (
      this.configuredRootDirs.length > 0 &&
      !isPathWithinConfiguredRoots(normalizedRelativePath, this.pathMappings)
    ) {
      throw new Error(`文件路径不在已配置的本地内容根目录内: ${normalizedRelativePath}`);
    }

    return normalizedRelativePath;
  }

  /**
   * 检查文件是否应该被排除
   */
  private shouldExcludeFile(relativePath: string): boolean {
    // 排除隐藏文件和目录
    if (relativePath.startsWith(".") || relativePath.includes("/.")) {
      return true;
    }

    // 排除 node_modules
    if (relativePath.includes("node_modules")) {
      return true;
    }

    // 检查自定义排除模式
    return this.excludePatterns.some((pattern) => {
      // 简单的通配符匹配
      const regex = new RegExp(pattern.replace(/\*/g, ".*"));
      return regex.test(relativePath);
    });
  }

  // ============================================================================
  // 静态工厂方法
  // ============================================================================

  /**
   * 创建默认的本地内容源配置
   */
  static createDefaultConfig(
    name: string = "local",
    priority: number = 50,
    options: Partial<LocalContentSourceOptions> = {}
  ): LocalContentSourceConfig {
    return {
      name,
      priority,
      enabled: true,
      options: {
        contentPath: "./src/content",
        recursive: true,
        excludePatterns: ["*.tmp", "*.bak", "*~"],
        watchChanges: false,
        pathMappings: LOCAL_PATH_MAPPINGS,
        ...options,
      },
    };
  }

  /**
   * 验证本地内容源配置
   */
  static validateConfig(config: LocalContentSourceConfig): boolean {
    if (!ContentSourceBase.validateConfig(config)) {
      return false;
    }

    if (!config.options.contentPath || typeof config.options.contentPath !== "string") {
      throw new Error("本地内容源必须指定 contentPath");
    }

    return true;
  }
}
