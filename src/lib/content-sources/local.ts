/**
 * 多源内容数据源架构 - 本地文件系统数据源实现
 *
 * 基于Astro Content Collections实现ContentDataSource接口
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import matter from 'gray-matter';
import type { ContentItem, ContentType } from '~/lib/content';
import { calculateReadingTime, parseMarkdownToHTML } from '~/utils/markdown';
import { cleanSlug, getPermalink } from '~/utils/permalinks';
import { BaseContentDataSource } from './base';
import type {
  ChangeInfo,
  ContentIndex,
  ContentSourceCapabilities,
  CreateContentInput,
  DirectoryInfo,
  ListContentOptions,
  UpdateContentInput,
} from './types';

// 直接定义错误类以避免导入问题
class ContentSourceError extends Error {
  constructor(
    message: string,
    public readonly source: string,
    public readonly code?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ContentSourceError';
  }
}

class ContentNotFoundError extends ContentSourceError {
  constructor(id: string, source: string) {
    super(`Content not found: ${id}`, source, 'CONTENT_NOT_FOUND');
    this.name = 'ContentNotFoundError';
  }
}

/**
 * 本地文件系统数据源实现
 * 支持Astro Content Collections和直接文件系统操作
 */
export class LocalFileSystemDataSource extends BaseContentDataSource {
  private basePath: string;
  private excludePaths: string[];
  private projectsPath: string;
  private memosPath: string;
  private watcher?: any; // FSWatcher类型，避免Node.js类型依赖
  private fileCache: Map<string, { content: ContentItem; lastModified: number }> = new Map();

  protected getDefaultCapabilities(): ContentSourceCapabilities {
    return {
      read: true,
      write: true,
      delete: true,
      createDirectory: true,
      uploadFile: true,
      downloadFile: true,
      renameFile: true,
      batchOperations: true,
      search: true,
      watch: true,
      etag: false,
      versioning: false,
    };
  }

  async initialize(): Promise<void> {
    try {
      this.basePath = this.config.config.basePath || './src/content';
      this.excludePaths = this.config.config.excludePaths
        ? this.config.config.excludePaths.split(',').map((p: string) => p.trim())
        : [];
      this.projectsPath = this.config.config.projectsPath || '/projects';
      this.memosPath = this.config.config.memosPath || '/memos';

      // 确保基础路径存在
      if (!existsSync(this.basePath)) {
        mkdirSync(this.basePath, { recursive: true });
        this.logInfo(`创建基础目录: ${this.basePath}`);
      }

      // 设置文件监听（如果支持）
      if (this.config.config.watchChanges && this.capabilities.watch) {
        await this.setupFileWatcher();
      }

      // 初始化文件缓存
      await this.buildFileCache();

      this.initialized = true;
      this.logInfo('本地文件系统数据源初始化成功');
    } catch (error) {
      console.error(`Failed to initialize local file system data source: ${error.message}`);
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      return existsSync(this.basePath);
    } catch (error) {
      this.logWarning(`本地文件系统可用性检查失败: ${error.message}`);
      return false;
    }
  }

  async getContent(id: string): Promise<ContentItem | null> {
    this.ensureInitialized();

    try {
      const fullPath = this.resolveContentPath(id);

      if (!existsSync(fullPath)) {
        return null;
      }

      // 检查缓存
      const stats = statSync(fullPath);
      const lastModified = stats.mtime.getTime();
      const cached = this.fileCache.get(id);

      if (cached && cached.lastModified >= lastModified) {
        return cached.content;
      }

      // 读取并解析文件
      const content = await this.parseContentFile(fullPath, id);

      // 更新缓存
      this.fileCache.set(id, { content, lastModified });

      return content;
    } catch (error) {
      if (error.code === 'ENOENT') {
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

    try {
      const allContent = await this.listContent({ type });
      return allContent.find((item) => item.slug === slug) || null;
    } catch (error) {
      this.logError('getContentBySlug', error);
      return null;
    }
  }

  async listContent(options?: ListContentOptions): Promise<ContentItem[]> {
    this.ensureInitialized();

    try {
      const results: ContentItem[] = [];

      // 扫描内容目录
      await this.scanDirectory(this.basePath, results, options);

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
      console.error(`Failed to list content: ${error.message}`);
      return [];
    }
  }

  async getContentIndex(): Promise<ContentIndex[]> {
    this.ensureInitialized();

    try {
      const results: ContentIndex[] = [];

      await this.scanDirectoryForIndex(this.basePath, results);

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

    try {
      const contentType = input.type || 'post';
      const collection = input.collection || (contentType === 'project' ? 'projects' : 'posts');

      // 生成文件路径
      let filePath: string;
      const filename = `${input.slug}.md`;

      if (input.customPath) {
        filePath = join(this.basePath, input.customPath, filename);
      } else {
        filePath = join(this.basePath, collection, filename);
      }

      // 确保目录存在
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // 序列化内容
      const frontmatter = {
        title: input.title,
        publishDate: new Date().toISOString(),
        draft: false,
        public: true,
        ...input.frontmatter,
      };

      const content = matter.stringify(input.body, frontmatter);

      // 写入文件
      writeFileSync(filePath, content, 'utf-8');

      // 生成相对路径作为ID
      const id = relative(this.basePath, filePath);

      // 解析并返回内容
      const createdContent = await this.parseContentFile(filePath, id);

      // 更新缓存
      const stats = statSync(filePath);
      this.fileCache.set(id, { content: createdContent, lastModified: stats.mtime.getTime() });

      this.logInfo(`创建内容文件: ${filePath}`);
      return createdContent;
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

    try {
      const fullPath = this.resolveContentPath(id);

      if (!existsSync(fullPath)) {
        throw new ContentNotFoundError(id, this.name);
      }

      // 读取现有内容
      const fileContent = readFileSync(fullPath, 'utf-8');
      const parsed = matter(fileContent);

      // 合并更新
      const updatedFrontmatter: any = {
        ...parsed.data,
        ...input.frontmatter,
        updateDate: new Date().toISOString(),
      };

      if (input.title) {
        updatedFrontmatter.title = input.title;
      }

      const updatedBody = input.body !== undefined ? input.body : parsed.content;
      const updatedContent = matter.stringify(updatedBody, updatedFrontmatter);

      // 写入文件
      writeFileSync(fullPath, updatedContent, 'utf-8');

      // 解析并返回更新后的内容
      const result = await this.parseContentFile(fullPath, id);

      // 更新缓存
      const stats = statSync(fullPath);
      this.fileCache.set(id, { content: result, lastModified: stats.mtime.getTime() });

      this.logInfo(`更新内容文件: ${fullPath}`);
      return result;
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

    try {
      const fullPath = this.resolveContentPath(id);

      if (!existsSync(fullPath)) {
        throw new ContentNotFoundError(id, this.name);
      }

      unlinkSync(fullPath);

      // 清除缓存
      this.fileCache.delete(id);

      this.logInfo(`删除内容文件: ${fullPath}`);
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

    try {
      const fullPath = join(this.basePath, path);
      const dir = dirname(fullPath);

      // 确保目录存在
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      if (content instanceof Buffer) {
        writeFileSync(fullPath, content);
      } else {
        writeFileSync(fullPath, content, 'utf-8');
      }

      this.logInfo(`上传文件: ${fullPath}`);
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

    try {
      const fullPath = join(this.basePath, path);

      if (!existsSync(fullPath)) {
        throw new ContentSourceError(`File not found: ${path}`, this.name, 'FILE_NOT_FOUND');
      }

      return readFileSync(fullPath);
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

    try {
      const fullOldPath = join(this.basePath, oldPath);
      const fullNewPath = join(this.basePath, newPath);

      if (!existsSync(fullOldPath)) {
        throw new ContentSourceError(`File not found: ${oldPath}`, this.name, 'FILE_NOT_FOUND');
      }

      // 确保新路径的目录存在
      const newDir = dirname(fullNewPath);
      if (!existsSync(newDir)) {
        mkdirSync(newDir, { recursive: true });
      }

      renameSync(fullOldPath, fullNewPath);

      // 更新缓存
      const oldCached = this.fileCache.get(oldPath);
      if (oldCached) {
        this.fileCache.delete(oldPath);
        this.fileCache.set(newPath, oldCached);
      }

      this.logInfo(`重命名文件: ${fullOldPath} -> ${fullNewPath}`);
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

    try {
      const fullPath = join(this.basePath, path);
      mkdirSync(fullPath, { recursive: true });
      this.logInfo(`创建目录: ${fullPath}`);
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

    try {
      const fullPath = join(this.basePath, path);

      if (!existsSync(fullPath)) {
        throw new ContentSourceError(`Directory not found: ${path}`, this.name, 'DIRECTORY_NOT_FOUND');
      }

      // 递归删除目录（需要额外的实现）
      this.removeDirectoryRecursive(fullPath);
      this.logInfo(`删除目录: ${fullPath}`);
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

    try {
      const targetPath = path ? join(this.basePath, path) : this.basePath;

      if (!existsSync(targetPath)) {
        return [];
      }

      const results: DirectoryInfo[] = [];
      const items = readdirSync(targetPath, { withFileTypes: true });

      for (const item of items) {
        if (item.isDirectory()) {
          const itemPath = join(targetPath, item.name);
          const stats = statSync(itemPath);
          const relativePath = relative(this.basePath, itemPath);

          results.push({
            path: relativePath || '.',
            name: item.name,
            type: 'directory',
            lastModified: stats.mtime,
          });
        }
      }

      return results.sort((a, b) => a.name.localeCompare(b.name));
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

  // 搜索功能实现
  async searchContent(query: string, options?: any): Promise<ContentItem[]> {
    this.validateCapability('search');
    this.ensureInitialized();

    try {
      const allContent = await this.listContent(options);
      const lowerQuery = query.toLowerCase();

      return allContent.filter(
        (item) =>
          item.title.toLowerCase().includes(lowerQuery) ||
          item.body.toLowerCase().includes(lowerQuery) ||
          (item.excerpt && item.excerpt.toLowerCase().includes(lowerQuery)) ||
          item.tags?.some((tag) => tag.title.toLowerCase().includes(lowerQuery))
      );
    } catch (error) {
      this.logError('searchContent', error);
      return [];
    }
  }

  // 缓存和同步实现
  async refreshIndex(): Promise<void> {
    this.ensureInitialized();

    try {
      await this.buildFileCache();
      this.logInfo('本地文件索引刷新完成');
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

    try {
      const fullPath = this.resolveContentPath(id);

      if (!existsSync(fullPath)) {
        return null;
      }

      const stats = statSync(fullPath);
      return stats.mtime;
    } catch (error) {
      this.logWarning(`获取文件修改时间失败 ${id}: ${error.message}`);
      return null;
    }
  }

  async checkChanges(since?: Date): Promise<ChangeInfo[]> {
    this.ensureInitialized();

    try {
      const changes: ChangeInfo[] = [];

      await this.scanDirectoryForChanges(this.basePath, changes, since);

      return changes.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      this.logError('checkChanges', error);
      return [];
    }
  }

  // 辅助方法
  private resolveContentPath(id: string): string {
    // 如果ID已经是绝对路径，直接使用
    if (id.startsWith('/') || id.includes(':')) {
      return id;
    }

    // 否则相对于basePath解析
    return join(this.basePath, id);
  }

  private async parseContentFile(filePath: string, id: string): Promise<ContentItem> {
    const fileContent = readFileSync(filePath, 'utf-8');
    const parsed = matter(fileContent);
    const stats = statSync(filePath);

    // 确定内容类型
    const contentType = this.determineContentTypeFromPath(id);

    // 生成slug
    const slug = parsed.data.slug || cleanSlug(basename(filePath, extname(filePath)));

    // 解析日期
    const publishDate = parsed.data.publishDate ? new Date(parsed.data.publishDate) : stats.birthtime;
    const updateDate = parsed.data.updateDate ? new Date(parsed.data.updateDate) : stats.mtime;

    // 解析内容
    const parsedContent = await parseMarkdownToHTML(parsed.content, id);
    const readingTime = calculateReadingTime(parsed.content);
    const permalink = getPermalink(slug, contentType);

    return {
      id,
      slug,
      type: contentType,
      permalink,
      title: parsed.data.title || basename(filePath, extname(filePath)),
      publishDate,
      updateDate,
      draft: parsed.data.draft || false,
      public: parsed.data.public !== false,
      excerpt: parsed.data.excerpt || '',
      body: parsed.content,
      content: parsedContent,
      readingTime,
      category: parsed.data.category ? { slug: parsed.data.category, title: parsed.data.category } : undefined,
      tags: parsed.data.tags?.map((tag: string) => ({ slug: tag, title: tag })) || [],
      author: parsed.data.author,
      image: parsed.data.image,
      metadata: parsed.data,
      dataSource: 'local', // 标识为本地文件系统来源
    };
  }

  private determineContentTypeFromPath(path: string): ContentType {
    const normalizedPath = path.replace(/\\/g, '/');

    if (normalizedPath.includes(this.memosPath)) {
      return 'memo';
    } else if (normalizedPath.includes(this.projectsPath)) {
      return 'project';
    } else {
      return 'post';
    }
  }

  private isPathExcluded(path: string): boolean {
    const normalizedPath = path.replace(/\\/g, '/');

    // 检查是否以 . 或 _ 开头
    if (normalizedPath.startsWith('.') || normalizedPath.startsWith('_')) {
      return true;
    }

    // 检查是否在配置的排除路径中
    for (const excludePath of this.excludePaths) {
      if (normalizedPath.includes(excludePath)) {
        return true;
      }
    }

    return false;
  }

  private async scanDirectory(dirPath: string, results: ContentItem[], options?: ListContentOptions): Promise<void> {
    const items = readdirSync(dirPath, { withFileTypes: true });

    for (const item of items) {
      const itemPath = join(dirPath, item.name);
      const relativePath = relative(this.basePath, itemPath);

      // 检查是否在排除路径中
      if (this.isPathExcluded(relativePath)) {
        continue;
      }

      if (item.isDirectory()) {
        // 递归扫描子目录
        await this.scanDirectory(itemPath, results, options);
      } else if (item.isFile() && (item.name.endsWith('.md') || item.name.endsWith('.mdx'))) {
        try {
          const id = relativePath;
          const contentType = this.determineContentTypeFromPath(id);

          // 根据选项过滤类型
          if (options?.type && options.type !== 'all' && options.type !== contentType) {
            continue;
          }

          const content = await this.parseContentFile(itemPath, id);
          results.push(content);
        } catch (error) {
          this.logWarning(`解析文件失败 ${itemPath}: ${error.message}`);
        }
      }
    }
  }

  private async scanDirectoryForIndex(dirPath: string, results: ContentIndex[]): Promise<void> {
    const items = readdirSync(dirPath, { withFileTypes: true });

    for (const item of items) {
      const itemPath = join(dirPath, item.name);

      if (item.isDirectory()) {
        await this.scanDirectoryForIndex(itemPath, results);
      } else if (item.isFile() && (item.name.endsWith('.md') || item.name.endsWith('.mdx'))) {
        try {
          const id = relative(this.basePath, itemPath);
          const contentType = this.determineContentTypeFromPath(id);
          const stats = statSync(itemPath);

          // 尝试读取frontmatter获取标题
          const fileContent = readFileSync(itemPath, 'utf-8');
          const parsed = matter(fileContent);
          const title = parsed.data.title || basename(item.name, extname(item.name));
          const slug = parsed.data.slug || cleanSlug(basename(item.name, extname(item.name)));

          results.push({
            id,
            slug,
            type: contentType,
            title,
            publishDate: parsed.data.publishDate ? new Date(parsed.data.publishDate) : stats.birthtime,
            updateDate: parsed.data.updateDate ? new Date(parsed.data.updateDate) : stats.mtime,
            draft: parsed.data.draft || false,
            public: parsed.data.public !== false,
            lastModified: stats.mtime,
          });
        } catch (error) {
          this.logWarning(`扫描文件索引失败 ${itemPath}: ${error.message}`);
        }
      }
    }
  }

  private async scanDirectoryForChanges(dirPath: string, changes: ChangeInfo[], since?: Date): Promise<void> {
    const items = readdirSync(dirPath, { withFileTypes: true });

    for (const item of items) {
      const itemPath = join(dirPath, item.name);

      if (item.isDirectory()) {
        await this.scanDirectoryForChanges(itemPath, changes, since);
      } else if (item.isFile() && (item.name.endsWith('.md') || item.name.endsWith('.mdx'))) {
        try {
          const stats = statSync(itemPath);
          const lastModified = stats.mtime;

          if (!since || lastModified > since) {
            const id = relative(this.basePath, itemPath);

            changes.push({
              id,
              type: 'updated', // 本地文件系统无法区分创建和更新
              timestamp: lastModified,
            });
          }
        } catch (error) {
          this.logWarning(`检查文件变更失败 ${itemPath}: ${error.message}`);
        }
      }
    }
  }

  private async buildFileCache(): Promise<void> {
    this.fileCache.clear();
    this.logInfo(`构建文件缓存完成，缓存 ${this.fileCache.size} 个文件`);
  }

  private async setupFileWatcher(): Promise<void> {
    try {
      // 动态导入fs模块以避免在不支持的环境中出错
      const fs = await import('node:fs');

      this.watcher = fs.watch(this.basePath, { recursive: true }, (eventType, filename) => {
        if (filename && (filename.endsWith('.md') || filename.endsWith('.mdx'))) {
          this.logInfo(`文件变更检测: ${eventType} ${filename}`);
          // 清除相关缓存
          this.fileCache.delete(filename);
        }
      });

      this.logInfo('文件监听器设置完成');
    } catch (error) {
      this.logWarning(`设置文件监听器失败: ${error.message}`);
    }
  }

  private removeDirectoryRecursive(dirPath: string): void {
    if (existsSync(dirPath)) {
      const items = readdirSync(dirPath);

      for (const item of items) {
        const itemPath = join(dirPath, item);
        const stats = statSync(itemPath);

        if (stats.isDirectory()) {
          this.removeDirectoryRecursive(itemPath);
        } else {
          unlinkSync(itemPath);
        }
      }

      // 删除空目录
      const { rmdir } = require('node:fs');
      rmdir(dirPath, () => {});
    }
  }

  // 生命周期方法
  async dispose(): Promise<void> {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }

    this.fileCache.clear();
    await super.dispose?.();
  }
}
