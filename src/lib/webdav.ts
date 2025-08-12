// WebDAV 客户端库 - 用于与 WebDAV 服务器交互

// WebDAV 请求配置
const WEBDAV_RETRY_ATTEMPTS = 3;
const WEBDAV_RETRY_BASE_DELAY = 1000; // 基础重试延迟 1 秒
const WEBDAV_RATE_LIMIT_DELAY = 5000; // 429 错误的额外延迟 5 秒

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 带重试和流控的 HTTP 请求包装函数
 */
async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= WEBDAV_RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, options);

      // 如果是 429 错误，进行重试
      if (response.status === 429) {
        if (attempt < WEBDAV_RETRY_ATTEMPTS) {
          const delayMs = WEBDAV_RETRY_BASE_DELAY * attempt + WEBDAV_RATE_LIMIT_DELAY;
          console.warn(`⏳ WebDAV 速率限制 (429)，第 ${attempt} 次重试，等待 ${delayMs}ms...`);
          await delay(delayMs);
          continue;
        } else {
          throw new Error(
            `WebDAV rate limited after ${WEBDAV_RETRY_ATTEMPTS} attempts: ${response.status} ${response.statusText}`
          );
        }
      }

      // 其他错误状态码直接返回，让调用者处理
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < WEBDAV_RETRY_ATTEMPTS) {
        const delayMs = WEBDAV_RETRY_BASE_DELAY * attempt;
        console.warn(
          `⏳ WebDAV 请求失败，第 ${attempt} 次重试，等待 ${delayMs}ms...`,
          (error as Error).message
        );
        await delay(delayMs);
      }
    }
  }

  throw lastError || new Error("WebDAV request failed after all retries");
}

export interface WebDAVFile {
  filename: string;
  basename: string;
  lastmod: string;
  size: number;
  type: "file" | "directory";
  etag?: string;
}

export interface WebDAVFileIndex {
  path: string;
  basename: string;
  lastmod: string;
  size: number;
  type: "file" | "directory";
  etag?: string;
  contentType?: "post" | "project" | "memo" | "other";
}

export interface WebDAVPost {
  id: string; // 相对路径作为 ID
  slug: string; // 从文件名或 frontmatter 生成
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>; // frontmatter 数据
  body: string; // 正文内容
  collection: "posts" | "projects"; // 集合类型
}

export interface MemoAttachment {
  filename: string; // 文件名
  path: string; // WebDAV 中的完整路径
  contentType?: string; // MIME 类型
  size?: number; // 文件大小（字节）
  isImage: boolean; // 是否为图片类型
}

export interface WebDAVMemo {
  id: string; // 相对路径作为 ID
  slug: string; // 从文件名或 frontmatter 生成
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>; // frontmatter 数据
  body: string; // 正文内容
  createdAt: Date; // 创建时间
  updatedAt: Date; // 更新时间
  attachments?: MemoAttachment[]; // 附件列表
  tags?: string[]; // 标签列表
}

export interface ProcessedWebDAVContent {
  filepath: string;
  slug: string;
  rawContent: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  frontmatter: Record<string, any>;
  contentHash: string;
  lastModified: number;
  effectiveContentUpdatedAt: number;
}

export interface DirectoryTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: DirectoryTreeNode[];
}

/**
 * WebDAV 客户端类
 */
export class WebDAVClient {
  private baseUrl: string;
  private username: string;
  private password: string;
  private excludePaths: string[];
  public projectsPath: string;
  private memosPath: string;

  constructor() {
    const webdavUrl = process.env.WEBDAV_URL;

    if (!webdavUrl) {
      throw new Error(
        "WebDAV configuration is incomplete. Please check WEBDAV_URL environment variable."
      );
    }

    this.baseUrl = webdavUrl.replace(/\/$/, ""); // 移除末尾斜杠
    this.username = process.env.WEBDAV_USERNAME || "";
    this.password = process.env.WEBDAV_PASSWORD || "";
    this.excludePaths = (process.env.WEBDAV_EXCLUDE_PATHS || "").split(",").filter(Boolean);
    this.projectsPath = process.env.WEBDAV_BLOG_PATH || "/blog";
    this.memosPath = process.env.WEBDAV_MEMOS_PATH || "/Memos";
  }

  /**
   * 创建基础认证头
   */
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/xml",
    };

    // 只有在提供了用户名和密码时才添加认证头
    if (this.username && this.password) {
      const credentials = Buffer.from(`${this.username}:${this.password}`).toString("base64");
      headers.Authorization = `Basic ${credentials}`;
    }

    return headers;
  }

  /**
   * 发送 PROPFIND 请求获取文件列表
   * @param path 路径
   * @param depth 深度，支持数字或 'infinity'
   */
  private async propfind(path: string, depth: number | "infinity" = 1): Promise<WebDAVFile[]> {
    // 如果 path 已经是完整的 URL，直接使用；否则拼接基础 URL
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;

    const body = `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:displayname/>
    <D:getlastmodified/>
    <D:getcontentlength/>
    <D:resourcetype/>
    <D:getetag/>
  </D:prop>
</D:propfind>`;

    const response = await fetchWithRetry(url, {
      method: "PROPFIND",
      headers: {
        ...this.getAuthHeaders(),
        Depth: depth.toString(),
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`WebDAV PROPFIND failed: ${response.status} ${response.statusText}`);
    }

    const xmlText = await response.text();

    return this.parseWebDAVResponse(xmlText);
  }

  /**
   * 解析 WebDAV XML 响应
   */
  private parseWebDAVResponse(xmlText: string): WebDAVFile[] {
    // 简单的 XML 解析，实际项目中建议使用专门的 XML 解析库
    const files: WebDAVFile[] = [];
    const seenPaths = new Set<string>(); // 用于去重
    const responseRegex = /<D:response[^>]*>([\s\S]*?)<\/D:response>/g;
    let match: RegExpExecArray | null;

    // biome-ignore lint/suspicious/noAssignInExpressions: 这是解析 XML 的标准模式
    while ((match = responseRegex.exec(xmlText)) !== null) {
      const responseContent = match[1];

      // 提取文件路径
      const hrefMatch = /<D:href[^>]*>([\s\S]*?)<\/D:href>/.exec(responseContent);
      if (!hrefMatch) continue;

      const rawHref = decodeURIComponent(hrefMatch[1]);

      // --- 健壮的路径解析逻辑 ---
      let relativePath: string;
      const base = new URL(this.baseUrl);

      // Case 1: href 是一个完整的 URL
      if (rawHref.startsWith("http://") || rawHref.startsWith("https://")) {
        const hrefUrl = new URL(rawHref);
        // 确保 href 与 baseUrl 在同一个源下
        if (hrefUrl.origin === base.origin) {
          relativePath = hrefUrl.pathname.substring(base.pathname.length);
        } else {
          // 跨域的 href，直接跳过
          continue;
        }
      } else {
        // Case 2: href 是一个绝对或相对路径
        relativePath = rawHref;
      }

      // 规范化路径，确保它以 / 开头，并移除 base 路径前缀（如果存在）
      if (relativePath.startsWith(base.pathname)) {
        relativePath = relativePath.substring(base.pathname.length);
      }
      if (!relativePath.startsWith("/")) {
        relativePath = `/${relativePath}`;
      }
      // -------------------------

      // 跳过根路径自身
      if (relativePath === "/") {
        continue;
      }

      // 标准化路径（移除末尾斜杠）进行去重
      const normalizedPath = relativePath.replace(/\/$/, "");
      if (seenPaths.has(normalizedPath)) continue;
      seenPaths.add(normalizedPath);

      const filename = normalizedPath.split("/").pop() || "";

      // 检查是否为目录
      const isDirectory =
        /<D:resourcetype[^>]*>[\s\S]*?<D:collection[\s\S]*?<\/D:resourcetype>/.test(
          responseContent
        ) || rawHref.endsWith("/");

      // 提取最后修改时间
      const lastmodMatch = /<D:getlastmodified[^>]*>([\s\S]*?)<\/D:getlastmodified>/.exec(
        responseContent
      );
      const lastmod = lastmodMatch ? lastmodMatch[1] : "";

      // 提取文件大小
      const sizeMatch = /<D:getcontentlength[^>]*>([\s\S]*?)<\/D:getcontentlength>/.exec(
        responseContent
      );
      const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;

      // 提取 ETag
      const etagMatch = /<D:getetag[^>]*>([\s\S]*?)<\/D:getetag>/.exec(responseContent);
      const etag = etagMatch ? etagMatch[1].replace(/"/g, "") : undefined;

      files.push({
        filename: relativePath,
        basename: filename,
        lastmod,
        size,
        type: isDirectory ? "directory" : "file",
        etag,
      });
    }

    return files;
  }

  /**
   * 获取文件内容
   * @param filePath 文件路径
   */
  async getFileContent(filePath: string): Promise<string> {
    const url = `${this.baseUrl}${filePath}`;

    const headers: Record<string, string> = {};

    // 只有在提供了用户名和密码时才添加认证头
    if (this.username && this.password) {
      headers.Authorization = `Basic ${Buffer.from(`${this.username}:${this.password}`).toString("base64")}`;
    }

    const response = await fetchWithRetry(url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to get file content: ${response.status} ${response.statusText}`);
    }

    return await response.text();
  }

  /**
   * 获取目录下的所有文件
   * @param dirPath 目录路径
   * @param recursive 是否递归获取子目录
   */
  async listFiles(dirPath: string = "/", recursive: boolean = false): Promise<WebDAVFile[]> {
    const depth = recursive ? "infinity" : 1;
    return await this.propfind(dirPath, depth);
  }

  /**
   * 检查路径是否应该被排除
   */
  private shouldExcludePath(path: string): boolean {
    return this.excludePaths.some(
      (excludePath) => path.includes(excludePath) || path.startsWith(`/${excludePath}`)
    );
  }
}

// 全局 WebDAV 客户端实例
let webdavClient: WebDAVClient | null = null;

/**
 * 检查 WebDAV 是否启用
 */
export function isWebDAVEnabled(): boolean {
  return !!process.env.WEBDAV_URL;
}

/**
 * 获取 WebDAV 客户端实例
 */
export function getWebDAVClient(): WebDAVClient {
  if (!webdavClient) {
    if (!isWebDAVEnabled()) {
      throw new Error("WebDAV 未配置，请设置 WEBDAV_URL 环境变量");
    }

    webdavClient = new WebDAVClient();
  }

  return webdavClient;
}
