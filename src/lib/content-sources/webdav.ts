/**
 * WebDAV 内容源实现
 *
 * 基于现有的 WebDAV 客户端实现远程内容同步
 */

import { WEBDAV_PATH_MAPPINGS } from "../../config/paths";
import { getWebDAVClient, isWebDAVEnabled, type WebDAVClient } from "../webdav";
import { ContentSourceBase } from "./base";
import type { ContentItem, ContentSourceConfig, ContentSourceStatus, FileInfo } from "./types";
import {
  createContentItemFromParsed,
  generateMemoFilename,
  generateNanoidSlug,
  isMarkdownFile,
  normalizePath,
  parseMarkdownContent,
  sanitizeContentItem,
  validateContentItem,
} from "./utils";

/**
 * Memo 元数据接口
 */
export interface MemoMetadata {
  /** 标题 */
  title?: string;
  /** URL 友好标识符 */
  slug?: string;
  /** 是否公开 */
  isPublic?: boolean;
  /** 标签列表 */
  tags?: string[];
  /** 附件列表 */
  attachments?: Array<{
    filename: string;
    path: string;
    contentType?: string;
    size?: number;
    isImage: boolean;
  }>;
  /** 作者邮箱 */
  authorEmail?: string;
  /** 其他元数据 */
  [key: string]: unknown;
}

/**
 * WebDAV 内容源配置
 * 支持多路径配置，每个内容类型可以有多个搜索路径
 */
export interface WebDAVContentSourceConfig extends ContentSourceConfig {
  options: {
    /** WebDAV 路径映射 */
    pathMappings: {
      /** 博客文章路径数组 */
      posts?: string[];
      /** 项目文档路径数组 */
      projects?: string[];
      /** 闪念内容路径数组 */
      memos?: string[];
    };
    /** 是否启用 ETag 缓存 */
    enableETagCache?: boolean;
    /** 连接超时时间（毫秒） */
    timeout?: number;
    /** 最大重试次数 */
    maxRetries?: number;
  };
}

/**
 * WebDAV 内容源
 */
export class WebDAVContentSource extends ContentSourceBase {
  private webdavClient: WebDAVClient;
  private pathMappings: Required<WebDAVContentSourceConfig["options"]["pathMappings"]>;
  private enableETagCache: boolean;
  private timeout: number;
  private maxRetries: number;
  private fileCache = new Map<string, FileInfo>();
  private etagCache = new Map<string, string>();

  constructor(config: WebDAVContentSourceConfig) {
    super(config, "webdav");

    const {
      pathMappings = {},
      enableETagCache = true,
      timeout = 30000,
      maxRetries = 3,
    } = config.options;

    // 设置默认路径映射，支持数组格式
    this.pathMappings = {
      posts: pathMappings.posts || WEBDAV_PATH_MAPPINGS.posts,
      projects: pathMappings.projects || WEBDAV_PATH_MAPPINGS.projects,
      memos: pathMappings.memos || WEBDAV_PATH_MAPPINGS.memos,
    };

    this.enableETagCache = enableETagCache;
    this.timeout = timeout;
    this.maxRetries = maxRetries;

    // 初始化 WebDAV 客户端（延迟到 initialize 方法中）
    this.webdavClient = null as unknown as WebDAVClient;
  }

  // ============================================================================
  // IContentSource 接口实现
  // ============================================================================

  async initialize(): Promise<void> {
    this.log("info", "初始化 WebDAV 内容源");

    try {
      // 检查 WebDAV 是否启用
      if (!isWebDAVEnabled()) {
        throw new Error("WebDAV 未配置，请设置相关环境变量");
      }

      // 获取 WebDAV 客户端实例
      this.webdavClient = getWebDAVClient();

      // 验证连接
      const isConnected = await this.validateConnection();
      if (!isConnected) {
        throw new Error("WebDAV 连接验证失败");
      }

      // 刷新文件缓存
      await this.refreshFileCache();

      this.isInitialized = true;
      this.log("info", `WebDAV 内容源初始化成功，发现 ${this.fileCache.size} 个文件`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log("error", `WebDAV 内容源初始化失败: ${errorMessage}`);
      throw error;
    }
  }

  async listContent(): Promise<ContentItem[]> {
    this.ensureInitialized();

    this.log("info", "开始扫描 WebDAV 内容文件");

    const contentItems: ContentItem[] = [];
    const markdownFiles = Array.from(this.fileCache.values()).filter(
      (file) => !file.isDirectory && isMarkdownFile(file.path)
    );

    for (const fileInfo of markdownFiles) {
      try {
        const relativePath = this.getRelativePath(fileInfo.path);

        // 获取文件内容
        const rawContent = await this.webdavClient.getFileContent(fileInfo.path);
        const parsed = parseMarkdownContent(rawContent, relativePath);
        const contentItem = createContentItemFromParsed(parsed, relativePath, this.name);

        // 更新 WebDAV 相关的字段
        contentItem.lastModified = fileInfo.lastModified;

        // 对于新创建的memo，使用文件的实际修改时间作为发布时间
        // 这样可以确保排序基于实际的文件创建/修改时间，而不是从文件名提取的日期
        if (!contentItem.publishDate || contentItem.publishDate < fileInfo.lastModified) {
          contentItem.publishDate = fileInfo.lastModified;
        }

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

    this.log("info", `WebDAV 内容扫描完成，处理了 ${contentItems.length} 个有效文件`);
    return contentItems;
  }

  async getContent(filePath: string): Promise<string> {
    this.ensureInitialized();

    try {
      // 将相对路径转换为 WebDAV 路径
      const webdavPath = this.resolveWebDAVPath(filePath);
      const content = await this.webdavClient.getFileContent(webdavPath);

      this.log("debug", `读取 WebDAV 文件内容: ${filePath}`);
      return content;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log("error", `读取 WebDAV 文件失败: ${filePath}`, filePath, { error: errorMessage });
      throw new Error(`无法读取 WebDAV 文件 ${filePath}: ${errorMessage}`);
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      // 尝试列出根目录来验证连接
      const files = await this.webdavClient.listFiles("/", false);
      return Array.isArray(files);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 抛出错误以便上层 getStatus() 捕获并回填到 UI 的 error 字段
      throw new Error(`WebDAV 连接失败: ${message}`);
    }
  }

  protected async getSourceSpecificStatus(): Promise<Partial<ContentSourceStatus>> {
    const markdownFiles = Array.from(this.fileCache.values()).filter(
      (file) => !file.isDirectory && isMarkdownFile(file.path)
    );

    return {
      totalItems: markdownFiles.length,
      metadata: {
        pathMappings: this.pathMappings,
        enableETagCache: this.enableETagCache,
        timeout: this.timeout,
        maxRetries: this.maxRetries,
        cachedFiles: this.fileCache.size,
        cachedETags: this.etagCache.size,
      },
    };
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 刷新文件缓存
   * 支持多路径扫描，遍历每个内容类型的所有配置路径
   */
  private async refreshFileCache(): Promise<void> {
    this.fileCache.clear();

    // 扫描所有配置的路径
    for (const [contentType, webdavPaths] of Object.entries(this.pathMappings)) {
      // 遍历该内容类型的所有路径
      for (const webdavPath of webdavPaths) {
        try {
          await this.scanWebDAVDirectory(webdavPath, contentType as keyof typeof this.pathMappings);
        } catch (error) {
          this.log("warn", `扫描 WebDAV 目录失败: ${webdavPath}`, undefined, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  /**
   * 扫描 WebDAV 目录
   */
  private async scanWebDAVDirectory(webdavPath: string, contentType: string): Promise<void> {
    this.log("debug", `开始扫描 WebDAV 目录: ${webdavPath} (类型: ${contentType})`);

    try {
      const files = await this.webdavClient.listFiles(webdavPath, false);
      this.log("debug", `WebDAV 目录 ${webdavPath} 返回 ${files.length} 个文件`);

      for (const webdavFile of files) {
        this.log("debug", `处理文件: ${webdavFile.filename} (类型: ${webdavFile.type})`);

        // 转换为标准的 FileInfo 格式
        const fileInfo: FileInfo = {
          path: webdavFile.filename,
          name: webdavFile.basename,
          extension: webdavFile.basename.split(".").pop()?.toLowerCase() || "",
          size: webdavFile.size,
          lastModified: new Date(webdavFile.lastmod).getTime() || Date.now(),
          etag: webdavFile.etag,
          isDirectory: webdavFile.type === "directory",
        };

        this.fileCache.set(webdavFile.filename, fileInfo);

        // 缓存 ETag
        if (this.enableETagCache && webdavFile.etag) {
          this.etagCache.set(webdavFile.filename, webdavFile.etag);
        }
      }

      this.log("info", `扫描 WebDAV 目录完成: ${webdavPath}，发现 ${files.length} 个项目`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log("error", `扫描 WebDAV 目录失败: ${webdavPath}`, undefined, { error: errorMessage });
      throw error;
    }
  }

  /**
   * 获取相对路径
   * 支持多路径映射，找到最匹配的路径前缀
   */
  private getRelativePath(webdavPath: string): string {
    // 直接返回原始的 WebDAV 路径，不进行任何映射
    // 文件的 id 和 filePath 应该保持原始路径
    return normalizePath(webdavPath);
  }

  /**
   * 解析 WebDAV 路径
   * 支持多路径配置，优先使用第一个路径进行写入操作
   */
  private resolveWebDAVPath(filePath: string): string {
    // 如果已经是 WebDAV 路径，直接返回
    if (filePath.startsWith("/")) {
      return filePath;
    }

    // 根据文件路径推断内容类型并映射到 WebDAV 路径
    const normalizedPath = filePath.toLowerCase();

    if (normalizedPath.startsWith("posts/")) {
      const postsPaths = this.pathMappings.posts;
      if (postsPaths.length > 0) {
        return `${postsPaths[0]}/${filePath.substring(6)}`;
      }
    }

    if (normalizedPath.startsWith("projects/")) {
      const projectsPaths = this.pathMappings.projects;
      if (projectsPaths.length > 0) {
        return `${projectsPaths[0]}/${filePath.substring(9)}`;
      }
    }

    if (normalizedPath.startsWith("memos/")) {
      const memosPaths = this.pathMappings.memos;
      if (memosPaths.length > 0) {
        return `${memosPaths[0]}/${filePath.substring(6)}`;
      }
    }

    // 默认映射到 posts 的第一个路径
    const postsPaths = this.pathMappings.posts;
    if (postsPaths.length > 0) {
      return `${postsPaths[0]}/${filePath}`;
    }

    // 如果没有配置任何路径，返回原始路径
    return `/${filePath}`;
  }

  /**
   * 写入文件内容
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      this.log("info", `写入 WebDAV 文件: ${filePath}`);

      // 解析 WebDAV 路径
      const webdavPath = this.resolveWebDAVPath(filePath);
      this.log("info", `解析后的 WebDAV 路径: ${webdavPath}`);
      this.log("info", `写入内容长度: ${content.length}`);
      this.log("info", `写入内容预览: ${content.substring(0, 100)}...`);

      // 使用 WebDAV 客户端写入文件
      await this.webdavClient.putFileContent(webdavPath, content);

      // 清除 ETag 缓存
      if (this.etagCache.has(filePath)) {
        this.etagCache.delete(filePath);
        this.log("info", `清除 ETag 缓存: ${filePath}`);
      }

      this.log("info", `WebDAV 文件写入成功: ${webdavPath}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log("error", `写入 WebDAV 文件失败: ${filePath}`, undefined, { error: errorMessage });
      throw error;
    }
  }

  // ============================================================================
  // Memo 专用方法
  // ============================================================================

  /**
   * 创建新的 memo
   */
  async createMemo(content: string, metadata: MemoMetadata): Promise<string> {
    try {
      this.log("info", "创建新 memo");

      // 按照文档规范生成文件名：{datePrefix}_{titleSlug}.md
      const timestamp = Date.now();
      const fileName = generateMemoFilename(content, metadata.title, timestamp);
      const filePath = fileName;

      // 生成数据库slug（使用nanoid确保唯一性）
      const dbSlug = generateNanoidSlug(8);

      // 构建 markdown 内容，传入数据库slug
      const markdownContent = this.buildMemoMarkdown(content, {
        ...metadata,
        dbSlug, // 添加数据库slug到元数据
      });

      // 写入到 WebDAV
      const webdavPath = `${this.pathMappings.memos}/${fileName}`;
      await this.webdavClient.putFileContent(webdavPath, markdownContent);

      this.log("info", `Memo 创建成功: ${webdavPath}`);
      this.log("info", `文件名: ${fileName}, 数据库slug: ${dbSlug}`);
      return filePath;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log("error", "创建 memo 失败", undefined, { error: errorMessage });
      throw error;
    }
  }

  /**
   * 更新现有 memo
   */
  async updateMemo(id: string, content: string, metadata: MemoMetadata): Promise<void> {
    try {
      this.log("info", `更新 memo: ${id}`);

      // 构建 markdown 内容，标记为更新操作
      const markdownContent = this.buildMemoMarkdown(content, {
        ...metadata,
        isUpdate: true, // 标记为更新操作，会添加updateDate字段
      });

      // 解析文件路径
      const fileName = id.endsWith(".md") ? id : `${id}.md`;
      const webdavPath = `${this.pathMappings.memos}/${fileName}`;

      // 写入到 WebDAV
      await this.webdavClient.putFileContent(webdavPath, markdownContent);

      // 清除缓存
      this.clearMemoCache(id);

      this.log("info", `Memo 更新成功: ${webdavPath}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log("error", `更新 memo 失败: ${id}`, undefined, { error: errorMessage });
      throw error;
    }
  }

  /**
   * 删除 memo
   */
  async deleteMemo(id: string): Promise<void> {
    try {
      this.log("info", `删除 memo: ${id}`);

      // 解析文件路径
      const fileName = id.endsWith(".md") ? id : `${id}.md`;
      const webdavPath = `${this.pathMappings.memos}/${fileName}`;

      // 从 WebDAV 删除
      await this.webdavClient.deleteFile(webdavPath);

      // 清除缓存
      this.clearMemoCache(id);

      this.log("info", `Memo 删除成功: ${webdavPath}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log("error", `删除 memo 失败: ${id}`, undefined, { error: errorMessage });
      throw error;
    }
  }

  /**
   * 上传 memo 附件
   */
  async uploadMemoAttachment(filename: string, content: ArrayBuffer): Promise<string> {
    try {
      this.log("info", `上传 memo 附件: ${filename}`);

      // 构建附件路径
      const attachmentPath = `${this.pathMappings.memos}/assets/${filename}`;

      // 上传到 WebDAV
      await this.webdavClient.putFileContent(attachmentPath, content);

      this.log("info", `Memo 附件上传成功: ${attachmentPath}`);
      return attachmentPath;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log("error", `上传 memo 附件失败: ${filename}`, undefined, { error: errorMessage });
      throw error;
    }
  }

  /**
   * 构建 memo markdown 内容
   */
  private buildMemoMarkdown(content: string, metadata: MemoMetadata): string {
    const now = new Date().toISOString();

    const frontmatter: Record<string, unknown> = {
      title: metadata.title || this.extractTitleFromContent(content),
      public: metadata.isPublic ?? true,
      tags: metadata.tags || [],
      publishDate: now, // 使用文档规范的字段名
    };

    // 如果是更新操作，添加updateDate
    if (metadata.isUpdate) {
      frontmatter.updateDate = now;
    }

    // 添加附件信息
    if (metadata.attachments && metadata.attachments.length > 0) {
      frontmatter.attachments = metadata.attachments;
    }

    // 添加其他元数据
    Object.keys(metadata).forEach((key) => {
      if (
        ![
          "title",
          "isPublic",
          "tags",
          "attachments",
          "authorEmail",
          "slug",
          "dbSlug",
          "isUpdate",
        ].includes(key)
      ) {
        frontmatter[key] = metadata[key];
      }
    });

    // 构建 frontmatter
    const frontmatterYaml = Object.entries(frontmatter)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return `${key}:\n${value.map((v) => `  - ${JSON.stringify(v)}`).join("\n")}`;
        }
        return `${key}: ${JSON.stringify(value)}`;
      })
      .join("\n");

    return `---\n${frontmatterYaml}\n---\n\n${content}`;
  }

  /**
   * 从内容中提取标题
   */
  private extractTitleFromContent(content: string): string {
    // 查找第一个 H1 标题
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match) {
      return h1Match[1].trim();
    }

    // 使用第一行内容
    const firstLine = content.split("\n")[0]?.trim();
    if (firstLine && firstLine.length > 0) {
      return firstLine.substring(0, 50);
    }

    return "无标题 Memo";
  }

  /**
   * 清除 memo 相关缓存
   * 支持多路径，清除所有 memo 路径相关的缓存
   */
  private clearMemoCache(id: string): void {
    const cacheKeys = Array.from(this.fileCache.keys()).filter((key) => {
      // 检查是否包含 ID
      if (key.includes(id)) {
        return true;
      }

      // 检查是否在任何 memo 路径下
      return this.pathMappings.memos.some((memoPath) => key.includes(memoPath));
    });

    cacheKeys.forEach((key) => {
      this.fileCache.delete(key);
      this.etagCache.delete(key);
    });
  }

  // ============================================================================
  // 静态工厂方法
  // ============================================================================

  /**
   * 创建默认的 WebDAV 内容源配置
   */
  static createDefaultConfig(
    name: string = "webdav",
    priority: number = 100
  ): WebDAVContentSourceConfig {
    return {
      name,
      priority,
      enabled: true,
      options: {
        pathMappings: WEBDAV_PATH_MAPPINGS,
        enableETagCache: true,
        timeout: 30000,
        maxRetries: 3,
      },
    };
  }

  /**
   * 验证 WebDAV 内容源配置
   */
  static validateConfig(config: WebDAVContentSourceConfig): boolean {
    if (!ContentSourceBase.validateConfig(config)) {
      return false;
    }

    if (!isWebDAVEnabled()) {
      throw new Error("WebDAV 未配置，请设置 WEBDAV_URL 环境变量");
    }

    return true;
  }
}
