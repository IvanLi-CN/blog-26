import { createHash } from 'node:crypto';
import * as yaml from 'js-yaml';
import { config } from './config';

export interface WebDAVFile {
  filename: string;
  basename: string;
  lastmod: string;
  size: number;
  type: 'file' | 'directory';
  etag?: string;
}

export interface WebDAVPost {
  id: string; // 相对路径作为 ID
  slug: string; // 从文件名或 frontmatter 生成
  data: Record<string, any>; // frontmatter 数据
  body: string; // 正文内容
  collection: 'post' | 'notes' | 'local-notes' | 'projects'; // 集合类型
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

/**
 * WebDAV 客户端类
 */
export class WebDAVClient {
  private baseUrl: string;
  private username: string;
  private password: string;
  private excludePaths: string[];
  private projectsPath: string;

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
   */
  private async propfind(path: string, depth: number = 1): Promise<WebDAVFile[]> {
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

    const response = await fetch(url, {
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

      let href = decodeURIComponent(hrefMatch[1]);

      // 移除 WebDAV 基础 URL 路径，只保留相对路径
      const baseUrlPath = new URL(this.baseUrl).pathname;
      if (href.startsWith(baseUrlPath)) {
        href = href.substring(baseUrlPath.length);
      }

      // 确保路径以 / 开头（如果不为空）
      if (href && !href.startsWith('/')) {
        href = '/' + href;
      }

      // 跳过空路径、根路径和自引用
      if (!href || href === '/' || href === '//' || href === baseUrlPath) {
        continue;
      }

      const filename = href.split('/').pop() || '';

      // 标准化路径（移除末尾斜杠）进行去重
      const normalizedPath = href.replace(/\/$/, '');
      if (seenPaths.has(normalizedPath)) continue;
      seenPaths.add(normalizedPath);

      // 检查是否为目录
      const isDirectory = /<D:resourcetype[^>]*>.*?<D:collection.*?<\/D:resourcetype>/s.test(responseContent);

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
        filename: href,
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
   */
  private async getFileContent(filePath: string): Promise<string> {
    const url = `${this.baseUrl}${filePath}`;

    const response = await fetch(url, {
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
   * 递归获取所有 Markdown 文件
   */
  private async getAllMarkdownFiles(dirPath: string = ''): Promise<WebDAVFile[]> {
    const files: WebDAVFile[] = [];
    const processedPaths = new Set<string>(); // 用于去重

    const processDirectory = async (currentPath: string): Promise<void> => {
      try {
        const items = await this.propfind(currentPath);

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
            // 递归处理子目录 - 构建完整的 URL
            const subDirUrl = `${this.baseUrl}${item.filename}`;
            await processDirectory(subDirUrl);
          } else if (item.type === 'file' && (item.basename.endsWith('.md') || item.basename.endsWith('.mdx'))) {
            files.push(item);
          }
        }
      } catch (error) {
        console.warn(`Failed to list directory ${currentPath}:`, error);
      }
    };

    // 初始调用，如果 dirPath 为空，使用基础 URL
    const initialPath = dirPath || this.baseUrl;
    await processDirectory(initialPath);
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
    let body = match[2];

    try {
      const frontmatter = (yaml.load(frontmatterText) as Record<string, any>) || {};

      return { frontmatter, body };
    } catch (error) {
      console.warn('Failed to parse frontmatter as YAML:', error);
      return { frontmatter: {}, body: content };
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
   * 获取所有博客文章
   */
  async getAllPosts(): Promise<WebDAVPost[]> {
    const files = await this.getAllMarkdownFiles();
    const posts: WebDAVPost[] = [];
    const processedSlugs = new Set<string>(); // 用于去重

    for (const file of files) {
      try {
        const content = await this.getFileContent(file.filename);
        const { frontmatter, body } = this.parseFrontmatter(content);
        const slug = this.generateSlug(file.filename, frontmatter);

        // 检查是否已经处理过相同的 slug
        if (processedSlugs.has(slug)) {
          continue;
        }
        processedSlugs.add(slug);

        // 确定集合类型
        let collection: 'post' | 'notes' | 'local-notes' | 'projects' = 'post';
        if (file.filename.includes('/notes/')) {
          collection = 'notes';
        } else if (file.filename.includes('/local-notes/')) {
          collection = 'local-notes';
        } else if (
          file.filename.includes(this.projectsPath + '/') ||
          file.filename.startsWith(this.projectsPath + '/')
        ) {
          collection = 'projects';
        }

        posts.push({
          id: file.filename,
          slug,
          data: frontmatter,
          body,
          collection,
        });
      } catch (error) {
        console.warn(`Failed to process file ${file.filename}:`, error);
      }
    }

    return posts;
  }

  /**
   * 根据 slug 获取单个文章
   */
  async getPostBySlug(slug: string): Promise<WebDAVPost | undefined> {
    const posts = await this.getAllPosts();
    return posts.find((post) => post.slug === slug);
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
   * 删除文件
   */
  async deleteFile(filePath: string): Promise<void> {
    const url = `${this.baseUrl}${filePath}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete file ${filePath}: ${response.status} ${response.statusText}`);
    }
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
    collection: 'post' | 'notes' | 'local-notes' | 'projects' = 'post'
  ): Promise<WebDAVPost> {
    // 生成文件路径
    let filePath: string;
    const filename = `${slug}.md`;

    switch (collection) {
      case 'notes':
        filePath = `/notes/${filename}`;
        break;
      case 'local-notes':
        filePath = `/local-notes/${filename}`;
        break;
      case 'projects':
        filePath = `${this.projectsPath}/${filename}`;
        break;
      default:
        filePath = `/${filename}`;
        break;
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
    let collection: 'post' | 'notes' | 'local-notes' | 'projects' = 'post';
    if (id.includes('/notes/')) {
      collection = 'notes';
    } else if (id.includes('/local-notes/')) {
      collection = 'local-notes';
    } else if (id.includes(this.projectsPath + '/') || id.startsWith(this.projectsPath + '/')) {
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

  /**
   * 删除文章
   */
  async deletePost(id: string): Promise<void> {
    await this.deleteFile(id);
  }
}

// 导出单例实例
let webdavClient: WebDAVClient | null = null;

export function getWebDAVClient(): WebDAVClient {
  if (!webdavClient) {
    webdavClient = new WebDAVClient();
  }
  return webdavClient;
}

// 检查 WebDAV 是否可用
export function isWebDAVEnabled(): boolean {
  const webdavConfig = config.webdav;
  return !!(webdavConfig.url && webdavConfig.username && webdavConfig.password);
}
