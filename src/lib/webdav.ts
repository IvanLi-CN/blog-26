import { createHash } from 'node:crypto';
import * as yaml from 'js-yaml';
import { nanoid } from 'nanoid';
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
  collection: 'post' | 'notes' | 'local-notes' | 'projects' | 'memos'; // 集合类型
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
  private projectsPath: string;
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
    collection: 'post' | 'notes' | 'local-notes' | 'projects' = 'post',
    customPath?: string
  ): Promise<WebDAVPost> {
    // 生成文件路径
    let filePath: string;
    const filename = `${slug}.md`;

    if (customPath) {
      // 如果提供了自定义路径，使用自定义路径
      filePath = customPath.endsWith('/') ? `${customPath}${filename}` : `${customPath}/${filename}`;
    } else {
      // 使用默认的collection逻辑
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

  /**
   * 获取目录树
   */
  async getDirectoryTree(): Promise<DirectoryTreeNode[]> {
    const allFiles: WebDAVFile[] = [];
    const processedPaths = new Set<string>();

    // 递归获取所有目录和文件
    const processDirectory = async (currentPath: string): Promise<void> => {
      if (processedPaths.has(currentPath)) return;
      processedPaths.add(currentPath);

      try {
        const items = await this.propfind(currentPath, 1);

        for (const item of items) {
          // 跳过自引用和根路径
          if (!item.filename || item.filename === currentPath || item.filename === '/' || item.filename === '//') {
            continue;
          }

          // 获取文件/目录名称
          const basename = item.basename || item.filename.split('/').pop() || '';

          // 跳过以 . 和 _ 开头的文件和目录
          if (basename.startsWith('.') || basename.startsWith('_')) {
            continue;
          }

          // 标准化路径
          let normalizedPath = item.filename;
          if (!normalizedPath.startsWith('/')) {
            normalizedPath = `/${normalizedPath}`;
          }

          // 检查是否在排除路径中
          const relativePath = normalizedPath.replace(/^\//, '');
          const shouldExclude = this.excludePaths.some(
            (excludePath) => relativePath.startsWith(excludePath + '/') || relativePath === excludePath
          );

          if (shouldExclude) {
            continue;
          }

          allFiles.push({
            ...item,
            filename: normalizedPath,
          });

          // 如果是目录，递归处理
          if (item.type === 'directory') {
            await processDirectory(normalizedPath);
          }
        }
      } catch (error) {
        console.warn(`Failed to process directory ${currentPath}:`, error);
      }
    };

    // 从根目录开始处理
    await processDirectory('/');

    // 构建目录树
    const pathMap = new Map<string, DirectoryTreeNode>();
    const rootNode: DirectoryTreeNode = {
      name: '/',
      path: '/',
      type: 'directory',
      children: [],
    };
    pathMap.set('/', rootNode);

    // 处理所有文件和目录
    for (const file of allFiles) {
      const path = file.filename;
      const pathParts = path.split('/').filter(Boolean);

      // 跳过根目录本身
      if (pathParts.length === 0) continue;

      let currentPath = '';
      let currentParent = rootNode;

      // 为每个路径部分创建节点
      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        currentPath += `/${part}`;

        if (!pathMap.has(currentPath)) {
          const isLastPart = i === pathParts.length - 1;
          const node: DirectoryTreeNode = {
            name: part,
            path: currentPath,
            type: isLastPart ? file.type : 'directory',
            children: file.type === 'directory' || !isLastPart ? [] : undefined,
          };

          pathMap.set(currentPath, node);
          currentParent.children!.push(node);
        }

        currentParent = pathMap.get(currentPath)!;
      }
    }

    // 递归排序所有节点的子节点：目录在前，文件在后，按自然语言顺序排序
    const sortChildren = (node: DirectoryTreeNode) => {
      if (node.children && node.children.length > 0) {
        // 先递归排序子节点
        node.children.forEach(sortChildren);

        // 排序当前节点的子节点
        node.children.sort((a, b) => {
          // 目录优先于文件
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
          }

          // 同类型按自然语言顺序排序
          return a.name.localeCompare(b.name, 'zh-CN', {
            numeric: true,
            sensitivity: 'base',
          });
        });
      }
    };

    // 对根节点的子节点进行排序
    if (rootNode.children) {
      rootNode.children.forEach(sortChildren);
      rootNode.children.sort((a, b) => {
        // 目录优先于文件
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }

        // 同类型按自然语言顺序排序
        return a.name.localeCompare(b.name, 'zh-CN', {
          numeric: true,
          sensitivity: 'base',
        });
      });
    }

    return rootNode.children || [];
  }

  /**
   * 创建目录
   */
  async createDirectory(path: string): Promise<void> {
    const url = `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      method: 'MKCOL',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to create directory ${path}: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * 确保目录存在，如果不存在则创建
   */
  async ensureDirectoryExists(path: string): Promise<void> {
    try {
      // 尝试获取目录信息
      await this.propfind(path, 0);
    } catch (error) {
      // 如果目录不存在，创建它
      if (error instanceof Error && error.message.includes('404')) {
        await this.createDirectory(path);
      } else {
        throw error;
      }
    }
  }

  /**
   * 从内容中提取第一个标题
   */
  private extractFirstHeading(content: string): string | null {
    // 匹配任何级别的 Markdown 标题
    const headingMatch = content.match(/^#{1,6}\s+(.+)$/m);
    if (headingMatch) {
      return headingMatch[1].trim();
    }
    return null;
  }

  /**
   * 生成 Memo 文件名
   */
  private generateMemoFilename(content: string): string {
    const now = new Date();
    const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

    // 尝试从内容中提取第一个标题
    const firstHeading = this.extractFirstHeading(content);

    if (firstHeading) {
      // 清理标题，只保留字母数字和中文字符
      const cleanTitle = firstHeading
        .replace(/[^\w\u4e00-\u9fff\s-]/g, '') // 只保留字母数字、中文、空格和连字符
        .replace(/\s+/g, '_') // 空格替换为下划线
        .slice(0, 50); // 限制长度

      return `${datePrefix}_${cleanTitle}.md`;
    } else {
      // 如果没有标题，使用 nanoid
      return `${datePrefix}_${nanoid(8)}.md`;
    }
  }

  /**
   * 删除目录（仅删除空目录）
   */
  async deleteDirectory(path: string): Promise<void> {
    // 首先检查目录是否为空
    const files = await this.propfind(path, 1);
    const hasChildren = files.some((file) => file.filename !== path && !file.filename.endsWith('/'));

    if (hasChildren) {
      throw new Error('Cannot delete non-empty directory');
    }

    const url = `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete directory ${path}: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * 重命名文件
   */
  async renameFile(oldPath: string, newPath: string): Promise<void> {
    const sourceUrl = `${this.baseUrl}${oldPath}`;
    const destinationUrl = `${this.baseUrl}${newPath}`;

    const response = await fetch(sourceUrl, {
      method: 'MOVE',
      headers: {
        ...this.getAuthHeaders(),
        Destination: destinationUrl,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to rename file from ${oldPath} to ${newPath}: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * 获取所有 Memos
   */
  async getAllMemos(): Promise<WebDAVMemo[]> {
    try {
      // 确保 Memos 目录存在
      await this.ensureDirectoryExists(this.memosPath);

      // 获取 Memos 目录下的所有文件
      const files = await this.propfind(this.memosPath, 1);

      // 过滤出 Markdown 文件并排除目录本身
      const memoFiles = files.filter(
        (file) => file.type === 'file' && file.filename.endsWith('.md') && file.filename !== this.memosPath
      );

      // 并行获取所有 Memo 内容
      const memos = await Promise.all(
        memoFiles.map(async (file) => {
          try {
            const relativePath = file.filename;
            const content = await this.getFileContent(relativePath);
            const { frontmatter, body } = this.parseFrontmatter(content);

            // 从文件名或 frontmatter 生成 slug
            const slug = this.generateSlug(relativePath, frontmatter);

            // 获取创建和更新时间
            const createdAt = frontmatter.date ? new Date(frontmatter.date) : new Date(file.lastmod);
            const updatedAt = frontmatter.updatedAt ? new Date(frontmatter.updatedAt) : new Date(file.lastmod);

            // 从内容中提取标题用于显示
            const displayTitle = this.extractFirstHeading(body) || '无标题 Memo';

            // 提取标签（如果 frontmatter 中没有的话）
            const tags = frontmatter.tags || this.extractTagsFromContent(body);

            // 获取附件信息（如果有的话）
            const attachments = frontmatter.attachments || [];

            return {
              id: relativePath,
              slug,
              data: { ...frontmatter, title: displayTitle },
              body,
              createdAt,
              updatedAt,
              attachments,
              tags,
            };
          } catch (error) {
            console.error(`Error processing memo file ${file.filename}:`, error);
            return null;
          }
        })
      );

      // 过滤掉处理失败的 Memo 并按创建时间降序排序
      const validMemos = memos.filter((memo): memo is NonNullable<typeof memo> => memo !== null);
      return validMemos.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      console.error('Failed to get memos:', error);
      return [];
    }
  }

  /**
   * 创建新的 Memo
   */
  async createMemo(content: string, isPublic: boolean = true, attachments: MemoAttachment[] = []): Promise<WebDAVMemo> {
    // 确保 Memos 目录存在
    await this.ensureDirectoryExists(this.memosPath);

    // 解析标签
    const tags = this.extractTagsFromContent(content);

    // 生成文件名
    const filename = this.generateMemoFilename(content);
    const filePath = `${this.memosPath}/${filename}`;

    // 处理附件：将临时附件移动到正式位置
    const finalAttachments: MemoAttachment[] = [];
    for (const attachment of attachments) {
      try {
        // 检查是否是临时文件路径
        if (attachment.path.includes('/assets/tmp/')) {
          // 移动临时文件到正式位置
          const finalPath = await this.moveTemporaryAttachment(attachment.path, filePath, attachment.filename);
          finalAttachments.push({
            ...attachment,
            path: finalPath,
          });
        } else {
          // 已经是正式路径，直接使用
          finalAttachments.push(attachment);
        }
      } catch (error) {
        console.error(`Failed to move attachment ${attachment.filename}:`, error);
        // 如果移动失败，仍然保留原路径（临时路径）
        finalAttachments.push(attachment);
      }
    }

    // 创建 frontmatter（不包含标题字段）
    const now = new Date();
    const frontmatter = {
      date: now.toISOString(),
      updatedAt: now.toISOString(),
      public: isPublic,
      attachments: finalAttachments.length > 0 ? finalAttachments : undefined,
      tags: tags.length > 0 ? tags : undefined,
    };

    // 序列化内容
    const fileContent = this.serializeMarkdownContent(frontmatter, content);

    // 保存文件
    await this.putFile(filePath, fileContent);

    // 从内容中提取标题用于显示
    const displayTitle = this.extractFirstHeading(content) || '无标题 Memo';

    // 返回创建的 Memo
    return {
      id: filePath,
      slug: this.generateSlug(filePath, frontmatter),
      data: { ...frontmatter, title: displayTitle },
      body: content,
      createdAt: now,
      updatedAt: now,
      attachments: finalAttachments,
      tags,
    };
  }

  /**
   * 更新 Memo
   */
  async updateMemo(id: string, content: string, attachments?: MemoAttachment[]): Promise<WebDAVMemo> {
    // 获取当前内容
    const currentContent = await this.getFileContent(id);
    const { frontmatter } = this.parseFrontmatter(currentContent);

    // 解析标签
    const tags = this.extractTagsFromContent(content);

    // 更新 frontmatter（不包含标题字段）
    const now = new Date();
    const updatedFrontmatter = {
      ...frontmatter,
      updatedAt: now.toISOString(),
      attachments:
        attachments !== undefined ? (attachments.length > 0 ? attachments : undefined) : frontmatter.attachments,
      tags: tags.length > 0 ? tags : undefined,
    };

    // 序列化内容
    const fileContent = this.serializeMarkdownContent(updatedFrontmatter, content);

    // 检查是否需要重命名文件（如果内容的第一个标题改变了）
    const newFilename = this.generateMemoFilename(content);
    const currentFilename = id.split('/').pop();

    if (newFilename !== currentFilename) {
      // 需要重命名文件
      const newId = id.replace(currentFilename!, newFilename);
      await this.putFile(newId, fileContent);
      await this.deleteFile(id);

      // 从内容中提取标题用于显示
      const displayTitle = this.extractFirstHeading(content) || '无标题 Memo';

      return {
        id: newId,
        slug: this.generateSlug(newId, updatedFrontmatter),
        data: { ...updatedFrontmatter, title: displayTitle },
        body: content,
        createdAt: frontmatter.date ? new Date(frontmatter.date) : now,
        updatedAt: now,
        attachments: attachments || updatedFrontmatter.attachments || [],
        tags: tags,
      };
    } else {
      // 不需要重命名，直接更新
      await this.putFile(id, fileContent);

      // 从内容中提取标题用于显示
      const displayTitle = this.extractFirstHeading(content) || '无标题 Memo';

      return {
        id,
        slug: this.generateSlug(id, updatedFrontmatter),
        data: { ...updatedFrontmatter, title: displayTitle },
        body: content,
        createdAt: frontmatter.date ? new Date(frontmatter.date) : now,
        updatedAt: now,
        attachments: attachments || updatedFrontmatter.attachments || [],
        tags: tags,
      };
    }
  }

  /**
   * 删除 Memo
   */
  async deleteMemo(id: string): Promise<void> {
    await this.deleteFile(id);
  }

  /**
   * 为 Memo 附件生成存储路径
   */
  generateAttachmentPath(memoId: string, filename: string, isTemporary: boolean = false): string {
    if (isTemporary) {
      // 临时文件存储在 assets/tmp 目录下
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 8);
      return `${this.memosPath}/assets/tmp/${timestamp}_${randomId}/${filename}`;
    }

    // 从 memo ID 中提取文件名（不含扩展名）
    const memoBasename = memoId.substring(memoId.lastIndexOf('/') + 1, memoId.lastIndexOf('.'));

    // 正式附件存储在 assets 目录下，按 memo 文件名分组
    return `${this.memosPath}/assets/${memoBasename}/${filename}`;
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
    const attachmentPath = this.generateAttachmentPath(memoId, filename, isTemporary);

    // 确保附件目录存在
    const attachmentDir = attachmentPath.substring(0, attachmentPath.lastIndexOf('/'));
    await this.ensureDirectoryExists(attachmentDir);

    // 上传附件文件
    await this.putBinaryFile(attachmentPath, content, contentType);

    return attachmentPath;
  }

  /**
   * 将临时附件移动到正式位置
   */
  async moveTemporaryAttachment(tempPath: string, memoId: string, filename: string): Promise<string> {
    const finalPath = this.generateAttachmentPath(memoId, filename, false);

    // 确保目标目录存在
    const finalDir = finalPath.substring(0, finalPath.lastIndexOf('/'));
    await this.ensureDirectoryExists(finalDir);

    try {
      // 尝试使用 WebDAV MOVE 方法
      const tempUrl = `${this.baseUrl}${tempPath}`;
      const finalUrl = `${this.baseUrl}${finalPath}`;

      const response = await fetch(tempUrl, {
        method: 'MOVE',
        headers: {
          ...this.getAuthHeaders(),
          Destination: finalUrl,
        },
      });

      if (response.ok) {
        return finalPath;
      }

      // 如果 MOVE 失败，回退到复制+删除的方式
      console.warn('WebDAV MOVE failed, falling back to copy+delete');
    } catch (error) {
      console.warn('WebDAV MOVE error, falling back to copy+delete:', error);
    }

    // 回退方案：先获取文件内容，然后复制到新位置，最后删除原文件
    // 注意：这里需要处理二进制文件
    const tempUrl = `${this.baseUrl}${tempPath}`;
    const response = await fetch(tempUrl, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to read temporary file ${tempPath}: ${response.status} ${response.statusText}`);
    }

    const fileContent = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || undefined;

    // 上传到最终位置
    await this.putBinaryFile(finalPath, fileContent, contentType);

    // 删除临时文件
    await this.deleteFile(tempPath);

    return finalPath;
  }

  /**
   * 从内容中提取标签
   * 标签格式：#标签名 或 #父标签/子标签
   * 标签以空格或标点符号分隔，但 / 用于表示层级关系
   */
  extractTagsFromContent(content: string): string[] {
    const tags: Set<string> = new Set();

    // 匹配以 # 开头的标签，支持中文、英文、数字、下划线、连字符和斜杠
    // 标签可以包含 / 来表示层级关系
    const tagRegex = /#([a-zA-Z0-9\u4e00-\u9fa5_\-\/]+)/g;

    let match;
    while ((match = tagRegex.exec(content)) !== null) {
      const tag = match[1];

      // 过滤掉空标签或只包含斜杠的标签
      if (tag && tag !== '/' && !tag.startsWith('/') && !tag.endsWith('/')) {
        // 清理标签：移除连续的斜杠
        const cleanedTag = tag.replace(/\/+/g, '/');
        tags.add(cleanedTag);
      }
    }

    return Array.from(tags).sort();
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
