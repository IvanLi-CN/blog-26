/**
 * 多源内容数据源架构 - WebDAV数据源实现
 *
 * 基于现有WebDAV客户端实现ContentDataSource接口
 */

import { normalizeWebDAVMemo, normalizeWebDAVPost } from '~/lib/content';
// 导入现有的WebDAV相关类型和客户端
import { getWebDAVClient, isWebDAVEnabled, type WebDAVClient, type WebDAVFileIndex } from '~/lib/webdav';
import { BaseContentDataSource } from './base';
import type {
  ChangeInfo,
  ContentIndex,
  ContentItem,
  ContentSourceCapabilities,
  ContentType,
  CreateContentInput,
  DirectoryInfo,
  ListContentOptions,
  UpdateContentInput,
} from './types';
import { ContentSourceError } from './types';

/**
 * WebDAV数据源实现
 * 重构现有WebDAV客户端代码以符合ContentDataSource接口
 */
export class WebDAVDataSource extends BaseContentDataSource {
  private client: WebDAVClient | null = null;

  protected getDefaultCapabilities(): ContentSourceCapabilities {
    return {
      read: true,
      write: true,
      delete: true,
      createDirectory: true,
      uploadFile: true,
      downloadFile: true,
      renameFile: true,
      batchOperations: false,
      search: false,
      watch: false,
      etag: true,
      versioning: false,
    };
  }

  async initialize(): Promise<void> {
    try {
      if (!isWebDAVEnabled()) {
        throw new ContentSourceError(
          'WebDAV is not enabled. Please check WEBDAV_URL environment variable.',
          this.name,
          'NOT_CONFIGURED'
        );
      }

      this.client = getWebDAVClient();

      // 测试连接
      await this.client.getFileIndex(1); // 简单的连接测试

      this.initialized = true;
      this.logInfo('WebDAV数据源初始化成功');
    } catch (error) {
      throw new ContentSourceError(
        `Failed to initialize WebDAV data source: ${error.message}`,
        this.name,
        'INITIALIZATION_FAILED',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      // 尝试获取根目录信息来测试连接
      await this.client.getFileIndex(1);
      return true;
    } catch (error) {
      this.logWarning(`WebDAV连接测试失败: ${error.message}`);
      return false;
    }
  }

  async getContent(id: string): Promise<ContentItem | null> {
    this.ensureInitialized();

    if (!this.client) {
      throw new ContentSourceError('WebDAV client not initialized', this.name, 'NOT_INITIALIZED');
    }

    try {
      // 根据路径判断内容类型
      const contentType = this.determineContentType(id);

      if (contentType === 'memo') {
        // 获取Memo内容
        const fileIndex = await this.findFileIndex(id);
        if (!fileIndex) {
          return null;
        }

        const memo = await this.client.getMemoByIndex(fileIndex);
        return normalizeWebDAVMemo(memo);
      } else {
        // 获取Post/Project内容
        const fileIndex = await this.findFileIndex(id);
        if (!fileIndex) {
          return null;
        }

        const post = await this.client.getPostByIndex(fileIndex);
        return await normalizeWebDAVPost(post, fileIndex.lastmod);
      }
    } catch (error) {
      if (error.message.includes('404') || error.message.includes('not found')) {
        return null;
      }

      this.logError('getContent', error);
      throw new ContentSourceError(
        `Failed to get content ${id}: ${error.message}`,
        this.name,
        'GET_CONTENT_FAILED',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  async getContentBySlug(slug: string, type?: ContentType): Promise<ContentItem | null> {
    this.ensureInitialized();

    if (!this.client) {
      throw new ContentSourceError('WebDAV client not initialized', this.name, 'NOT_INITIALIZED');
    }

    try {
      if (type === 'memo' || (!type && slug.includes('memo'))) {
        // 搜索Memo - 需要遍历所有memo来找到匹配的slug
        const memosIndex = await this.client.getMemosIndex();
        for (const memoIndex of memosIndex) {
          try {
            const memo = await this.client.getMemoByIndex(memoIndex);
            if (memo.slug === slug) {
              return normalizeWebDAVMemo(memo);
            }
          } catch (error) {
            console.warn(`Failed to load memo ${memoIndex.path}:`, error);
            continue;
          }
        }
        return null;
      } else {
        // 搜索Post/Project
        const post = await this.client.getPostBySlug(slug);
        if (!post) {
          return null;
        }

        // 获取文件索引以获取lastmod信息
        const fileIndex = await this.findFileIndex(post.id);
        return await normalizeWebDAVPost(post, fileIndex?.lastmod || new Date().toISOString());
      }
    } catch (error) {
      this.logError('getContentBySlug', error);
      return null;
    }
  }

  async listContent(options?: ListContentOptions): Promise<ContentItem[]> {
    this.ensureInitialized();

    if (!this.client) {
      throw new ContentSourceError('WebDAV client not initialized', this.name, 'NOT_INITIALIZED');
    }

    try {
      const results: ContentItem[] = [];

      // 根据类型过滤
      const shouldIncludePosts = !options?.type || options.type === 'all' || options.type === 'post';
      const shouldIncludeProjects = !options?.type || options.type === 'all' || options.type === 'project';
      const shouldIncludeMemos = !options?.type || options.type === 'all' || options.type === 'memo';

      // 获取Posts和Projects
      if (shouldIncludePosts || shouldIncludeProjects) {
        const postsIndex = await this.client.getPostsIndex();
        const filteredPostsIndex = postsIndex.filter((index) => {
          if (shouldIncludePosts && shouldIncludeProjects) return true;
          if (shouldIncludePosts && index.contentType === 'post') return true;
          if (shouldIncludeProjects && index.contentType === 'project') return true;
          return false;
        });

        const posts = await Promise.all(
          filteredPostsIndex.map(async (fileIndex) => {
            try {
              const post = await this.client!.getPostByIndex(fileIndex);
              return await normalizeWebDAVPost(post, fileIndex.lastmod);
            } catch (error) {
              this.logWarning(`处理文章失败 ${fileIndex.path}: ${error.message}`);
              return null;
            }
          })
        );

        results.push(...posts.filter((post): post is ContentItem => post !== null));
      }

      // 获取Memos
      if (shouldIncludeMemos) {
        const memosIndex = await this.client.getMemosIndex();
        const memos = await Promise.all(
          memosIndex.map(async (fileIndex) => {
            try {
              const memo = await this.client!.getMemoByIndex(fileIndex);
              return normalizeWebDAVMemo(memo);
            } catch (error) {
              this.logWarning(`处理闪念失败 ${fileIndex.path}: ${error.message}`);
              return null;
            }
          })
        );

        results.push(...memos.filter((memo): memo is ContentItem => memo !== null));
      }

      // 应用过滤条件
      let filteredResults = results;

      if (options?.includePrivate === false) {
        filteredResults = filteredResults.filter((item) => item.public !== false);
      }

      if (options?.includeDrafts === false) {
        filteredResults = filteredResults.filter((item) => item.draft !== true);
      }

      if (options?.tags && options.tags.length > 0) {
        filteredResults = filteredResults.filter((item) => item.tags?.some((tag) => options.tags!.includes(tag.slug)));
      }

      if (options?.category) {
        filteredResults = filteredResults.filter((item) => item.category?.slug === options.category);
      }

      // 排序
      const sortBy = options?.sortBy || 'publishDate';
      const sortOrder = options?.sortOrder || 'desc';

      filteredResults.sort((a, b) => {
        let aValue: any, bValue: any;

        switch (sortBy) {
          case 'publishDate':
            aValue = a.publishDate.getTime();
            bValue = b.publishDate.getTime();
            break;
          case 'updateDate':
            aValue = a.updateDate?.getTime() || a.publishDate.getTime();
            bValue = b.updateDate?.getTime() || b.publishDate.getTime();
            break;
          case 'title':
            aValue = a.title.toLowerCase();
            bValue = b.title.toLowerCase();
            break;
          default:
            aValue = a.publishDate.getTime();
            bValue = b.publishDate.getTime();
        }

        if (sortOrder === 'asc') {
          return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        } else {
          return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
        }
      });

      // 分页
      if (options?.offset || options?.limit) {
        const offset = options.offset || 0;
        const limit = options.limit || filteredResults.length;
        filteredResults = filteredResults.slice(offset, offset + limit);
      }

      return filteredResults;
    } catch (error) {
      this.logError('listContent', error);
      throw new ContentSourceError(
        `Failed to list content: ${error.message}`,
        this.name,
        'LIST_CONTENT_FAILED',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  async getContentIndex(): Promise<ContentIndex[]> {
    this.ensureInitialized();

    if (!this.client) {
      throw new ContentSourceError('WebDAV client not initialized', this.name, 'NOT_INITIALIZED');
    }

    try {
      const results: ContentIndex[] = [];

      // 获取所有文件索引
      const fileIndex = await this.client.getFileIndex();

      for (const file of fileIndex) {
        if (file.type === 'file' && (file.basename.endsWith('.md') || file.basename.endsWith('.mdx'))) {
          const contentType = this.determineContentType(file.path);

          results.push({
            id: file.path,
            slug: this.extractSlugFromPath(file.path),
            type: contentType,
            title: file.basename.replace(/\.(md|mdx)$/, ''),
            publishDate: new Date(file.lastmod),
            lastModified: new Date(file.lastmod),
            etag: file.etag,
          });
        }
      }

      return results.sort((a, b) => b.publishDate.getTime() - a.publishDate.getTime());
    } catch (error) {
      this.logError('getContentIndex', error);
      throw new ContentSourceError(
        `Failed to get content index: ${error.message}`,
        this.name,
        'GET_INDEX_FAILED',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  // 写入操作实现
  async createContent(input: CreateContentInput): Promise<ContentItem> {
    this.validateCapability('write');
    this.ensureInitialized();

    if (!this.client) {
      throw new ContentSourceError('WebDAV client not initialized', this.name, 'NOT_INITIALIZED');
    }

    try {
      if (input.type === 'memo') {
        // 创建Memo
        const attachments = input.frontmatter?.attachments || [];
        const memo = await this.client.createMemo(input.body, input.frontmatter?.public !== false, attachments);
        return normalizeWebDAVMemo(memo);
      } else {
        // 创建Post/Project
        const collection = input.collection || (input.type === 'project' ? 'projects' : 'posts');
        const post = await this.client.createPost(
          input.slug,
          input.frontmatter || {},
          input.body,
          collection,
          input.customPath
        );

        // 获取文件索引以获取lastmod信息
        const fileIndex = await this.findFileIndex(post.id);
        const normalized = await normalizeWebDAVPost(post, fileIndex?.lastmod || new Date().toISOString());
        if (!normalized) {
          throw new ContentSourceError(`Failed to normalize post: ${post.id}`, this.name, 'NORMALIZATION_FAILED');
        }
        return normalized;
      }
    } catch (error) {
      this.logError('createContent', error);
      throw new ContentSourceError(
        `Failed to create content: ${error.message}`,
        this.name,
        'CREATE_CONTENT_FAILED',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  async updateContent(id: string, input: UpdateContentInput): Promise<ContentItem> {
    this.validateCapability('write');
    this.ensureInitialized();

    if (!this.client) {
      throw new ContentSourceError('WebDAV client not initialized', this.name, 'NOT_INITIALIZED');
    }

    try {
      const contentType = this.determineContentType(id);

      if (contentType === 'memo') {
        // 更新Memo
        const memo = await this.client.updateMemo(id, input.body || '', input.frontmatter?.public !== false);
        return normalizeWebDAVMemo(memo);
      } else {
        // 更新Post/Project
        const post = await this.client.updatePost(id, input.frontmatter || {}, input.body || '');

        // 获取文件索引以获取lastmod信息
        const fileIndex = await this.findFileIndex(post.id);
        const normalized = await normalizeWebDAVPost(post, fileIndex?.lastmod || new Date().toISOString());
        if (!normalized) {
          throw new ContentSourceError(`Failed to normalize post: ${post.id}`, this.name, 'NORMALIZATION_FAILED');
        }
        return normalized;
      }
    } catch (error) {
      this.logError('updateContent', error);
      throw new ContentSourceError(
        `Failed to update content ${id}: ${error.message}`,
        this.name,
        'UPDATE_CONTENT_FAILED',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  async deleteContent(id: string): Promise<void> {
    this.validateCapability('delete');
    this.ensureInitialized();

    if (!this.client) {
      throw new ContentSourceError('WebDAV client not initialized', this.name, 'NOT_INITIALIZED');
    }

    try {
      const contentType = this.determineContentType(id);

      if (contentType === 'memo') {
        await this.client.deleteMemo(id);
      } else {
        await this.client.deletePost(id);
      }
    } catch (error) {
      this.logError('deleteContent', error);
      throw new ContentSourceError(
        `Failed to delete content ${id}: ${error.message}`,
        this.name,
        'DELETE_CONTENT_FAILED',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  // 文件操作实现
  async uploadFile(path: string, content: Buffer | string): Promise<string> {
    this.validateCapability('uploadFile');
    this.ensureInitialized();

    if (!this.client) {
      throw new ContentSourceError('WebDAV client not initialized', this.name, 'NOT_INITIALIZED');
    }

    try {
      if (content instanceof Buffer) {
        await this.client.putBinaryFile(path, content.buffer as ArrayBuffer);
      } else {
        await this.client.putFile(path, content as string);
      }
      return path;
    } catch (error) {
      this.logError('uploadFile', error);
      throw new ContentSourceError(
        `Failed to upload file ${path}: ${error.message}`,
        this.name,
        'UPLOAD_FILE_FAILED',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  async downloadFile(path: string): Promise<Buffer> {
    this.validateCapability('downloadFile');
    this.ensureInitialized();

    if (!this.client) {
      throw new ContentSourceError('WebDAV client not initialized', this.name, 'NOT_INITIALIZED');
    }

    try {
      const content = await this.client.getFileContent(path);
      return Buffer.from(content, 'utf-8');
    } catch (error) {
      this.logError('downloadFile', error);
      throw new ContentSourceError(
        `Failed to download file ${path}: ${error.message}`,
        this.name,
        'DOWNLOAD_FILE_FAILED',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    this.validateCapability('renameFile');
    this.ensureInitialized();

    if (!this.client) {
      throw new ContentSourceError('WebDAV client not initialized', this.name, 'NOT_INITIALIZED');
    }

    try {
      await this.client.renameFile(oldPath, newPath);
    } catch (error) {
      this.logError('renameFile', error);
      throw new ContentSourceError(
        `Failed to rename file from ${oldPath} to ${newPath}: ${error.message}`,
        this.name,
        'RENAME_FILE_FAILED',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  // 目录操作实现
  async createDirectory(path: string): Promise<void> {
    this.validateCapability('createDirectory');
    this.ensureInitialized();

    if (!this.client) {
      throw new ContentSourceError('WebDAV client not initialized', this.name, 'NOT_INITIALIZED');
    }

    try {
      await this.client.createDirectory(path);
    } catch (error) {
      this.logError('createDirectory', error);
      throw new ContentSourceError(
        `Failed to create directory ${path}: ${error.message}`,
        this.name,
        'CREATE_DIRECTORY_FAILED',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  async deleteDirectory(path: string): Promise<void> {
    this.validateCapability('delete');
    this.ensureInitialized();

    if (!this.client) {
      throw new ContentSourceError('WebDAV client not initialized', this.name, 'NOT_INITIALIZED');
    }

    try {
      await this.client.deleteDirectory(path);
    } catch (error) {
      this.logError('deleteDirectory', error);
      throw new ContentSourceError(
        `Failed to delete directory ${path}: ${error.message}`,
        this.name,
        'DELETE_DIRECTORY_FAILED',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  async listDirectories(path?: string): Promise<DirectoryInfo[]> {
    this.validateCapability('read');
    this.ensureInitialized();

    if (!this.client) {
      throw new ContentSourceError('WebDAV client not initialized', this.name, 'NOT_INITIALIZED');
    }

    try {
      const directoryTree = await this.client.getDirectoryTree();
      return this.convertDirectoryTreeToInfo(directoryTree, path);
    } catch (error) {
      this.logError('listDirectories', error);
      throw new ContentSourceError(
        `Failed to list directories: ${error.message}`,
        this.name,
        'LIST_DIRECTORIES_FAILED',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  // 缓存和同步实现
  async refreshIndex(): Promise<void> {
    this.ensureInitialized();

    if (!this.client) {
      throw new ContentSourceError('WebDAV client not initialized', this.name, 'NOT_INITIALIZED');
    }

    try {
      // 强制刷新文件索引
      await this.client.getFileIndex();
      this.logInfo('WebDAV索引刷新完成');
    } catch (error) {
      this.logError('refreshIndex', error);
      throw new ContentSourceError(
        `Failed to refresh index: ${error.message}`,
        this.name,
        'REFRESH_INDEX_FAILED',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  async getLastModified(id: string): Promise<Date | null> {
    this.ensureInitialized();

    if (!this.client) {
      return null;
    }

    try {
      const fileIndex = await this.findFileIndex(id);
      return fileIndex ? new Date(fileIndex.lastmod) : null;
    } catch (error) {
      this.logWarning(`获取文件修改时间失败 ${id}: ${error.message}`);
      return null;
    }
  }

  async checkChanges(since?: Date): Promise<ChangeInfo[]> {
    this.ensureInitialized();

    if (!this.client) {
      return [];
    }

    try {
      const fileIndex = await this.client.getFileIndex();
      const changes: ChangeInfo[] = [];

      for (const file of fileIndex) {
        if (file.type === 'file' && (file.basename.endsWith('.md') || file.basename.endsWith('.mdx'))) {
          const lastModified = new Date(file.lastmod);

          if (!since || lastModified > since) {
            changes.push({
              id: file.path,
              type: 'updated', // WebDAV无法区分创建和更新，统一标记为更新
              timestamp: lastModified,
              etag: file.etag,
            });
          }
        }
      }

      return changes.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      this.logError('checkChanges', error);
      return [];
    }
  }

  // 辅助方法
  private determineContentType(path: string): ContentType {
    if (!this.client) {
      return 'post';
    }

    // 从配置中获取路径信息
    const webdavConfig = this.config.config;
    const memosPath = webdavConfig.memosPath;
    const projectsPath = webdavConfig.projectsPath;

    // 根据路径判断内容类型
    if (memosPath && path.includes(memosPath)) {
      return 'memo';
    } else if (projectsPath && path.includes(projectsPath)) {
      return 'project';
    } else {
      return 'post';
    }
  }

  private extractSlugFromPath(path: string): string {
    // 从路径中提取slug
    const basename = path.split('/').pop() || '';
    return basename.replace(/\.(md|mdx)$/, '');
  }

  private async findFileIndex(id: string): Promise<WebDAVFileIndex | null> {
    if (!this.client) {
      return null;
    }

    try {
      const fileIndex = await this.client.getFileIndex();
      return fileIndex.find((file) => file.path === id) || null;
    } catch (error) {
      this.logWarning(`查找文件索引失败 ${id}: ${error.message}`);
      return null;
    }
  }

  private convertDirectoryTreeToInfo(tree: any[], basePath?: string): DirectoryInfo[] {
    const results: DirectoryInfo[] = [];

    for (const node of tree) {
      if (node.type === 'directory') {
        const dirInfo: DirectoryInfo = {
          path: node.path,
          name: node.name,
          type: 'directory',
          lastModified: new Date(), // WebDAV目录没有修改时间，使用当前时间
        };

        if (node.children) {
          dirInfo.children = this.convertDirectoryTreeToInfo(node.children, node.path);
        }

        // 如果指定了basePath，只返回该路径下的目录
        if (!basePath || node.path.startsWith(basePath)) {
          results.push(dirInfo);
        }
      }
    }

    return results;
  }

  // 生命周期方法
  async dispose(): Promise<void> {
    this.client = null;
    await super.dispose?.();
  }
}
