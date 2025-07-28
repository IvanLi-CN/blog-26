import { createHash } from 'node:crypto';
import * as yaml from 'js-yaml';
import { config } from './config';

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
        console.warn(`⏳ WebDAV 请求失败，第 ${attempt} 次重试，等待 ${delayMs}ms...`, error.message);
        await delay(delayMs);
      }
    }
  }

  throw lastError || new Error('WebDAV request failed after all retries');
}

export interface WebDAVFile {
  filename: string;
  basename: string;
  lastmod: string;
  size: number;
  type: 'file' | 'directory';
  etag?: string;
}

export interface WebDAVFileIndex {
  path: string;
  basename: string;
  lastmod: string;
  size: number;
  type: 'file' | 'directory';
  etag?: string;
  contentType?: 'post' | 'project' | 'memo' | 'other';
}

export interface WebDAVPost {
  id: string; // 相对路径作为 ID
  slug: string; // 从文件名或 frontmatter 生成
  data: Record<string, any>; // frontmatter 数据
  body: string; // 正文内容
  collection: 'posts' | 'projects'; // 集合类型
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
  frontmatter: Record<string, any>;
  contentHash: string;
  lastModified: number;
  effectiveContentUpdatedAt: number;
}

export interface DirectoryTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
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
    const webdavConfig = config.webdav;

    if (!webdavConfig.url || !webdavConfig.username || !webdavConfig.password) {
      throw new Error(
        'WebDAV configuration is incomplete. Please check WEBDAV_URL, WEBDAV_USERNAME, and WEBDAV_PASSWORD environment variables.'
      );
    }

    this.baseUrl = webdavConfig.url.replace(/\/$/, ''); // 移除末尾斜杠
    this.username = webdavConfig.username;
    this.password = webdavConfig.password;
    this.excludePaths = webdavConfig.excludePaths;
    this.projectsPath = webdavConfig.projectsPath;
    this.memosPath = webdavConfig.memosPath;
  }

  /**
   * 创建基础认证头
   */
  private getAuthHeaders(): Record<string, string> {
    const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    return {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/xml',
    };
  }

  /**
   * 发送 PROPFIND 请求获取文件列表
   * @param path 路径
   * @param depth 深度，支持数字或 'infinity'
   */
  private async propfind(path: string, depth: number | 'infinity' = 1): Promise<WebDAVFile[]> {
    // 如果 path 已经是完整的 URL，直接使用；否则拼接基础 URL
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;

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
      method: 'PROPFIND',
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
    const responseRegex = /<D:response[^>]*>(.*?)<\/D:response>/gs;
    let match: RegExpExecArray | null;

    while ((match = responseRegex.exec(xmlText)) !== null) {
      const responseContent = match[1];

      // 提取文件路径
      const hrefMatch = /<D:href[^>]*>(.*?)<\/D:href>/s.exec(responseContent);
      if (!hrefMatch) continue;

      const rawHref = decodeURIComponent(hrefMatch[1]);

      // --- 健壮的路径解析逻辑 ---
      let relativePath: string;
      const base = new URL(this.baseUrl);

      // Case 1: href 是一个完整的 URL
      if (rawHref.startsWith('http://') || rawHref.startsWith('https://')) {
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
      if (!relativePath.startsWith('/')) {
        relativePath = '/' + relativePath;
      }
      // -------------------------

      // 跳过根路径自身
      if (relativePath === '/') {
        continue;
      }

      // 标准化路径（移除末尾斜杠）进行去重
      const normalizedPath = relativePath.replace(/\/$/, '');
      if (seenPaths.has(normalizedPath)) continue;
      seenPaths.add(normalizedPath);

      const filename = normalizedPath.split('/').pop() || '';

      // 检查是否为目录
      const isDirectory =
        /<D:resourcetype[^>]*>.*?<D:collection.*?<\/D:resourcetype>/s.test(responseContent) || rawHref.endsWith('/');

      // 提取最后修改时间
      const lastmodMatch = /<D:getlastmodified[^>]*>(.*?)<\/D:getlastmodified>/s.exec(responseContent);
      const lastmod = lastmodMatch ? lastmodMatch[1] : '';

      // 提取文件大小
      const sizeMatch = /<D:getcontentlength[^>]*>(.*?)<\/D:getcontentlength>/s.exec(responseContent);
      const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;

      // 提取 ETag
      const etagMatch = /<D:getetag[^>]*>(.*?)<\/D:getetag>/s.exec(responseContent);
      const etag = etagMatch ? etagMatch[1].replace(/"/g, '') : undefined;

      files.push({
        filename: relativePath,
        basename: filename,
        lastmod,
        size,
        type: isDirectory ? 'directory' : 'file',
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

    const response = await fetchWithRetry(url, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch file ${filePath}: ${response.status} ${response.statusText}`);
    }

    return await response.text();
  }

  /**
   * 获取文件索引（不获取内容）
   * 使用递归的深度为 1 的 PROPFIND 请求来遍历所有目录
   * @param maxDepth 最大递归深度，默认为 10
   */
  async getFileIndex(maxDepth: number = 10): Promise<WebDAVFileIndex[]> {
    const files: WebDAVFileIndex[] = [];
    const processedPaths = new Set<string>(); // 用于去重

    const processDirectory = async (currentPath: string, currentDepth: number): Promise<void> => {
      if (currentDepth > maxDepth) {
        console.warn(`Reached max depth ${maxDepth} at path ${currentPath}`);
        return;
      }

      try {
        const items = await this.propfind(currentPath, 1);

        for (const item of items) {
          // 跳过空路径、根路径和自引用
          if (!item.filename || item.filename === '/' || item.filename === '//' || item.filename === currentPath) {
            continue;
          }

          // 跳过隐藏文件和以下划线开头的文件
          const basename = item.basename || item.filename.split('/').pop() || '';
          if (basename.startsWith('.') || basename.startsWith('_')) {
            continue;
          }

          // 标准化路径（移除末尾斜杠）进行去重
          const normalizedItemPath = item.filename.replace(/\/$/, '');
          if (processedPaths.has(normalizedItemPath)) {
            continue;
          }
          processedPaths.add(normalizedItemPath);

          // 检查是否在排除路径中
          const relativePath = item.filename.replace(/^\//, '');
          const shouldExclude = this.excludePaths.some(
            (excludePath) => relativePath.startsWith(excludePath + '/') || relativePath === excludePath
          );

          if (shouldExclude) {
            continue;
          }

          if (item.type === 'directory') {
            // 递归处理子目录
            await processDirectory(item.filename, currentDepth + 1);
          } else if (item.type === 'file' && (item.basename.endsWith('.md') || item.basename.endsWith('.mdx'))) {
            // 根据路径确定内容类型
            let contentType: 'post' | 'project' | 'memo' | 'other' = 'other';

            if (this.memosPath && relativePath.startsWith(this.memosPath.replace(/^\//, ''))) {
              contentType = 'memo';
            } else if (this.projectsPath && relativePath.startsWith(this.projectsPath.replace(/^\//, ''))) {
              contentType = 'project';
            } else {
              contentType = 'post';
            }

            files.push({
              path: item.filename,
              basename: item.basename,
              lastmod: item.lastmod,
              size: item.size,
              type: item.type,
              etag: item.etag,
              contentType,
            });
          }
        }
      } catch (error) {
        console.warn(`Failed to list directory ${currentPath}:`, error);
      }
    };

    try {
      await processDirectory('/', 0);
    } catch (error) {
      console.error('Failed to get file index:', error);
      throw error;
    }

    return files;
  }

  /**
   * 解析 frontmatter
   */
  private parseFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return { frontmatter: {}, body: content };
    }

    const frontmatterText = match[1];
    const body = match[2];

    try {
      // Use JSON_SCHEMA to prevent automatic type conversion (e.g., for dates)
      const frontmatter = (yaml.load(frontmatterText, { schema: yaml.JSON_SCHEMA }) as Record<string, any>) || {};
      return { frontmatter, body };
    } catch (error) {
      console.warn('Failed to parse frontmatter as YAML:', error);
      // Fallback to default loader on error
      try {
        const frontmatter = (yaml.load(frontmatterText) as Record<string, any>) || {};
        return { frontmatter, body };
      } catch {
        return { frontmatter: {}, body: content };
      }
    }
  }

  /**
   * 生成 slug
   */
  private generateSlug(filePath: string, frontmatter: Record<string, any>): string {
    // 优先使用 frontmatter 中的 slug
    if (frontmatter.slug) {
      return frontmatter.slug;
    }

    // 从文件路径生成 slug
    const relativePath = filePath.replace(/^\//, '');
    const pathWithoutExt = relativePath.replace(/\.(md|mdx)$/, '');

    // 替换路径分隔符
    return pathWithoutExt.replace(/\//g, '-');
  }

  /**
   * 获取所有博客文章（仅返回索引，不获取内容）
   */
  async getPostsIndex(): Promise<WebDAVFileIndex[]> {
    const allFiles = await this.getFileIndex();
    return allFiles.filter((file) => file.contentType === 'post' || file.contentType === 'project');
  }

  /**
   * 根据文件索引获取单个文章内容
   */
  async getPostByIndex(fileIndex: WebDAVFileIndex): Promise<WebDAVPost> {
    const content = await this.getFileContent(fileIndex.path);
    const { frontmatter, body } = this.parseFrontmatter(content);
    const slug = this.generateSlug(fileIndex.path, frontmatter);

    const collection: 'posts' | 'projects' = fileIndex.contentType === 'project' ? 'projects' : 'posts';

    return {
      id: fileIndex.path,
      slug,
      data: frontmatter,
      body,
      collection,
    };
  }

  /**
   * 获取所有博客文章（包含内容，已废弃，请使用 getPostsIndex + getPostByIndex）
   * @deprecated 使用 getPostsIndex() 和 getPostByIndex() 代替
   */
  async getAllPosts(): Promise<WebDAVPost[]> {
    console.warn('getAllPosts() is deprecated, use getPostsIndex() and getPostByIndex() instead');
    const postsIndex = await this.getPostsIndex();
    const posts: WebDAVPost[] = [];

    for (const fileIndex of postsIndex) {
      try {
        const post = await this.getPostByIndex(fileIndex);
        posts.push(post);
      } catch (error) {
        console.warn(`Failed to process file ${fileIndex.path}:`, error);
      }
    }

    return posts;
  }

  /**
   * 获取目录树
   */
  async getDirectoryTree(): Promise<DirectoryTreeNode[]> {
    const allFiles = await this.getFileIndex();
    const root: DirectoryTreeNode = { name: 'root', path: '/', type: 'directory', children: [] };

    for (const file of allFiles) {
      const pathParts = file.path.split('/').filter((p: string) => p);
      let currentNode = root;

      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        let childNode = currentNode.children?.find((c) => c.name === part);

        if (!childNode) {
          const isDirectory = i < pathParts.length - 1 || file.type === 'directory';
          childNode = {
            name: part,
            path: '/' + pathParts.slice(0, i + 1).join('/'),
            type: isDirectory ? 'directory' : 'file',
            children: isDirectory ? [] : undefined,
          };
          currentNode.children?.push(childNode);
        }
        currentNode = childNode;
      }
    }
    return root.children || [];
  }

  /**
   * 获取所有闪念索引（仅返回索引，不获取内容）
   */
  async getMemosIndex(): Promise<WebDAVFileIndex[]> {
    const allFiles = await this.getFileIndex();
    return allFiles.filter((file) => file.contentType === 'memo');
  }

  /**
   * 根据文件索引获取单个闪念内容
   */
  async getMemoByIndex(fileIndex: WebDAVFileIndex): Promise<WebDAVMemo> {
    const content = await this.getFileContent(fileIndex.path);
    const { frontmatter, body } = this.parseFrontmatter(content);
    const slug = this.generateSlug(fileIndex.path, frontmatter);

    // 改进时间解析逻辑 - Memo 可以使用文件修改时间作为备选
    let createdAt: Date;
    if (frontmatter.createdAt) {
      createdAt = new Date(frontmatter.createdAt);
      if (isNaN(createdAt.getTime())) {
        console.warn(`Invalid createdAt for memo ${fileIndex.path}:`, frontmatter.createdAt);
        createdAt = new Date(fileIndex.lastmod);
      }
    } else {
      createdAt = new Date(fileIndex.lastmod);
    }

    let updatedAt: Date;
    if (frontmatter.updatedAt) {
      updatedAt = new Date(frontmatter.updatedAt);
      if (isNaN(updatedAt.getTime())) {
        console.warn(`Invalid updatedAt for memo ${fileIndex.path}:`, frontmatter.updatedAt);
        updatedAt = new Date(fileIndex.lastmod);
      }
    } else {
      updatedAt = new Date(fileIndex.lastmod);
    }

    return {
      id: fileIndex.path,
      slug,
      data: frontmatter,
      body,
      createdAt,
      updatedAt,
      tags: frontmatter.tags || [],
      attachments: frontmatter.attachments || [],
    };
  }

  /**
   * 获取所有闪念（包含内容，已废弃，请使用 getMemosIndex + getMemoByIndex）
   * @deprecated 使用 getMemosIndex() 和 getMemoByIndex() 代替
   */
  async getAllMemos(): Promise<WebDAVMemo[]> {
    console.warn('getAllMemos() is deprecated, use getMemosIndex() and getMemoByIndex() instead');
    const memosIndex = await this.getMemosIndex();
    const memos: WebDAVMemo[] = [];

    for (const fileIndex of memosIndex) {
      try {
        const memo = await this.getMemoByIndex(fileIndex);
        memos.push(memo);
      } catch (error) {
        console.warn(`Failed to process memo file ${fileIndex.path}:`, error);
      }
    }
    return memos;
  }

  /**
   * 根据 slug 获取单个文章
   */
  async getPostBySlug(slug: string): Promise<WebDAVPost | undefined> {
    const postsIndex = await this.getPostsIndex();

    for (const fileIndex of postsIndex) {
      try {
        const post = await this.getPostByIndex(fileIndex);
        if (post.slug === slug) {
          return post;
        }
      } catch (error) {
        console.warn(`Failed to process file ${fileIndex.path}:`, error);
      }
    }

    return undefined;
  }

  /**
   * 处理内容用于向量化
   */
  async processContentForVectorization(post: WebDAVPost): Promise<ProcessedWebDAVContent> {
    const contentHash = createHash('md5').update(post.body).digest('hex');
    const lastModified = Date.now(); // WebDAV 文件的修改时间

    return {
      filepath: post.id,
      slug: post.slug,
      rawContent: post.body,
      frontmatter: post.data,
      contentHash,
      lastModified,
      effectiveContentUpdatedAt: lastModified,
    };
  }

  /**
   * 创建或更新文件
   */
  async putFile(filePath: string, content: string): Promise<void> {
    const url = `${this.baseUrl}${filePath}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: content,
    });

    if (!response.ok) {
      throw new Error(`Failed to put file ${filePath}: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * 上传二进制文件（如图片、附件等）
   */
  async putBinaryFile(filePath: string, content: ArrayBuffer, contentType?: string): Promise<void> {
    const url = `${this.baseUrl}${filePath}`;

    const headers: Record<string, string> = {
      ...this.getAuthHeaders(),
    };

    // 如果提供了 contentType，则设置 Content-Type
    if (contentType) {
      headers['Content-Type'] = contentType;
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: content,
    });

    if (!response.ok) {
      throw new Error(`Failed to put binary file ${filePath}: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * 删除文件
   */
  async deleteFile(filePath: string): Promise<void> {
    const url = `${this.baseUrl}${filePath}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      // 如果是 404 错误，说明文件已经不存在，视为删除成功
      if (response.status === 404) {
        console.log(`✅ 文件不存在 (404)，视为删除成功: ${filePath}`);
        return;
      }
      throw new Error(`Failed to delete file ${filePath}: ${response.status} ${response.statusText}`);
    }

    console.log(`✅ 文件删除成功: ${filePath}`);
  }

  /**
   * 序列化 frontmatter 和内容为完整的 Markdown 文件内容
   */
  serializeMarkdownContent(frontmatter: Record<string, any>, body: string): string {
    const yamlContent = yaml.dump(frontmatter, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
    });

    return `---\n${yamlContent}---\n\n${body}`;
  }

  /**
   * 创建新文章
   */
  async createPost(
    slug: string,
    frontmatter: Record<string, any>,
    body: string,
    collection: 'posts' | 'projects' = 'posts',
    customPath?: string
  ): Promise<WebDAVPost> {
    // 生成文件路径
    let filePath: string;
    const filename = `${slug}.md`;

    if (customPath) {
      // 如果提供了自定义路径，使用自定义路径
      filePath = customPath.endsWith('/') ? `${customPath}${filename}` : `${customPath}/${filename}`;
    } else if (collection === 'projects') {
      filePath = `${this.projectsPath}/${filename}`;
    } else {
      filePath = `/${filename}`;
    }

    // 序列化内容
    const content = this.serializeMarkdownContent(frontmatter, body);

    // 上传文件
    await this.putFile(filePath, content);

    // 返回创建的文章对象
    return {
      id: filePath,
      slug,
      data: frontmatter,
      body,
      collection,
    };
  }

  /**
   * 更新现有文章
   */
  async updatePost(id: string, frontmatter: Record<string, any>, body: string): Promise<WebDAVPost> {
    // 序列化内容
    const content = this.serializeMarkdownContent(frontmatter, body);

    // 更新文件
    await this.putFile(id, content);

    // 确定集合类型
    let collection: 'posts' | 'projects' = 'posts';
    if (id.startsWith(this.projectsPath)) {
      collection = 'projects';
    }

    const slug = this.generateSlug(id, frontmatter);

    return {
      id,
      slug,
      data: frontmatter,
      body,
      collection,
    };
  }

  async deletePost(id: string): Promise<void> {
    await this.deleteFile(id);
  }

  async createDirectory(path: string): Promise<void> {
    await this.putFile(`${path}/`, '');
  }

  async deleteDirectory(path: string): Promise<void> {
    await this.deleteFile(path);
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    const headers = {
      ...this.getAuthHeaders(),
      Destination: `${this.baseUrl}${newPath}`,
      Overwrite: 'T',
    };
    const response = await fetch(`${this.baseUrl}${oldPath}`, {
      method: 'MOVE',
      headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to rename file: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * 创建新 Memo
   */
  async createMemo(content: string, isPublic: boolean, attachments: MemoAttachment[] = []): Promise<WebDAVMemo> {
    const now = new Date();
    const id = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now
      .getDate()
      .toString()
      .padStart(2, '0')}-${now.getTime()}.md`;
    const filePath = `${this.memosPath}/${id}`;

    // 使用统一的标签解析函数从正文中提取标签
    const { parseTagsFromContent } = await import('~/utils/utils');
    const parsedTags = parseTagsFromContent(content);
    const tags = parsedTags.map((tag) => tag.content);

    const frontmatter: Record<string, any> = {
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      public: isPublic,
      tags: tags.length > 0 ? tags : undefined, // 只有当有标签时才添加 tags 字段
      attachments: attachments.map((a) => ({
        filename: a.filename,
        path: a.path,
        contentType: a.contentType,
        size: a.size,
        isImage: a.isImage,
      })),
    };

    const fullContent = this.serializeMarkdownContent(frontmatter, content);
    await this.putFile(filePath, fullContent);

    const slug = this.generateSlug(filePath, frontmatter);

    return {
      id: filePath,
      slug,
      data: frontmatter,
      body: content,
      createdAt: now,
      updatedAt: now,
      attachments,
      tags,
    };
  }

  /**
   * 更新 Memo
   */
  async updateMemo(id: string, content: string, isPublic?: boolean): Promise<WebDAVMemo> {
    const fileContent = await this.getFileContent(id);
    const { frontmatter } = this.parseFrontmatter(fileContent);
    const now = new Date();

    // 使用统一的标签解析函数从正文中提取标签
    const { parseTagsFromContent } = await import('~/utils/utils');
    const parsedTags = parseTagsFromContent(content);
    const tags = parsedTags.map((tag) => tag.content);

    frontmatter.updatedAt = now.toISOString();
    frontmatter.tags = tags.length > 0 ? tags : undefined; // 更新标签

    // 如果提供了isPublic参数，则更新公开状态
    if (isPublic !== undefined) {
      frontmatter.public = isPublic;
    }

    const fullContent = this.serializeMarkdownContent(frontmatter, content);
    await this.putFile(id, fullContent);

    const slug = this.generateSlug(id, frontmatter);

    return {
      id,
      slug,
      data: frontmatter,
      body: content,
      createdAt: new Date(frontmatter.createdAt || now),
      updatedAt: now,
      attachments: frontmatter.attachments || [],
      tags,
    };
  }

  /**
   * 删除 Memo
   */
  async deleteMemo(id: string): Promise<void> {
    console.log(`🗑️ 删除闪念: ${id}`);

    // 检查文件是否存在
    try {
      const allFiles = await this.getFileIndex();
      const memoFiles = allFiles.filter((file) => file.contentType === 'memo');

      const targetFile = memoFiles.find((f) => f.path === id);
      if (!targetFile) {
        console.log(`⚠️ 闪念文件不存在，视为删除成功: ${id}`);
        return;
      }
    } catch (error) {
      console.warn(`检查闪念文件时出错，仍然尝试删除:`, error.message);
    }

    await this.deleteFile(id);
  }

  /**
   * 上传 Memo 附件
   */
  async uploadMemoAttachment(
    memoId: string,
    filename: string,
    content: ArrayBuffer,
    contentType?: string,
    isTemporary: boolean = false
  ): Promise<string> {
    const assetsPath = isTemporary ? `${this.memosPath}/assets/tmp` : `${this.memosPath}/assets/${memoId}`;
    const filePath = `${assetsPath}/${filename}`;

    // 确保目录存在
    try {
      await this.propfind(assetsPath);
    } catch (error) {
      // @ts-ignore
      if (error.message.includes('404')) {
        await this.createDirectory(assetsPath);
      } else {
        throw error;
      }
    }

    await this.putBinaryFile(filePath, content, contentType);
    return filePath;
  }
}

let _webdavClient: WebDAVClient | undefined;

export function getWebDAVClient(): WebDAVClient {
  if (!_webdavClient) {
    _webdavClient = new WebDAVClient();
  }
  return _webdavClient;
}

export function isWebDAVEnabled(): boolean {
  return !!(config.webdav.url && config.webdav.username && config.webdav.password);
}
