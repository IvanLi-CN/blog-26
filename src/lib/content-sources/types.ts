/**
 * 多源内容数据源架构 - 核心类型定义
 *
 * 定义了统一的内容数据源接口和相关类型，支持多种数据源的统一管理
 */

import type { ContentItem as BaseContentItem, ContentType as BaseContentType } from '~/lib/content';

// 重新导出类型以便在模块内使用
export type ContentType = BaseContentType;
export type ContentItem = BaseContentItem;

// 数据源类型枚举
export type DataSourceType = 'local' | 'webdav' | 'git' | 'database';

// 内容操作选项
export interface ListContentOptions {
  type?: ContentType | 'all';
  limit?: number;
  offset?: number;
  includePrivate?: boolean;
  includeDrafts?: boolean;
  sortBy?: 'publishDate' | 'updateDate' | 'title';
  sortOrder?: 'asc' | 'desc';
  tags?: string[];
  category?: string;
}

export interface SearchOptions {
  query: string;
  type?: ContentType | 'all';
  limit?: number;
  includePrivate?: boolean;
  includeDrafts?: boolean;
}

export interface CreateContentInput {
  slug: string;
  type: ContentType;
  title: string;
  body: string;
  frontmatter?: Record<string, any>;
  customPath?: string;
  collection?: 'posts' | 'projects';
}

export interface UpdateContentInput {
  title?: string;
  body?: string;
  frontmatter?: Record<string, any>;
  slug?: string;
}

export interface BatchUpdateInput {
  id: string;
  input: UpdateContentInput;
}

// 内容索引信息
export interface ContentIndex {
  id: string;
  slug: string;
  type: ContentType;
  title: string;
  publishDate: Date;
  updateDate?: Date;
  draft?: boolean;
  public?: boolean;
  lastModified: Date;
  etag?: string;
  contentHash?: string;
}

// 目录信息
export interface DirectoryInfo {
  path: string;
  name: string;
  type: 'directory';
  lastModified: Date;
  children?: DirectoryInfo[];
}

// 变更信息
export interface ChangeInfo {
  id: string;
  type: 'created' | 'updated' | 'deleted';
  timestamp: Date;
  etag?: string;
  contentHash?: string;
}

// 同步选项和结果
export interface SyncOptions {
  since?: Date;
  force?: boolean;
  dryRun?: boolean;
}

export interface SyncResult {
  updated: number;
  created: number;
  deleted: number;
  errors: Array<{
    source: string;
    error: string;
  }>;
}

// 数据源能力标识
export interface ContentSourceCapabilities {
  read: boolean; // 支持读取
  write: boolean; // 支持写入
  delete: boolean; // 支持删除
  createDirectory: boolean; // 支持创建目录
  uploadFile: boolean; // 支持文件上传
  downloadFile: boolean; // 支持文件下载
  renameFile: boolean; // 支持文件重命名
  batchOperations: boolean; // 支持批量操作
  search: boolean; // 支持搜索
  watch: boolean; // 支持文件监听
  etag: boolean; // 支持ETag
  versioning: boolean; // 支持版本控制
}

// 数据源配置
export interface DataSourceConfig {
  name: string;
  type: DataSourceType;
  enabled: boolean;
  priority: number;
  required?: boolean;
  config: Record<string, any>;
  capabilities?: Partial<ContentSourceCapabilities>;
}

// 多源管理配置
export interface MultiSourceConfig {
  dataSources: DataSourceConfig[];
  cache: {
    enabled: boolean;
    ttl: number;
    refreshInterval: number;
    maxSize?: number;
  };
}

/**
 * 统一的内容数据源接口
 * 所有数据源实现都必须实现此接口
 */
export interface ContentDataSource {
  // 基本属性
  readonly name: string;
  readonly type: DataSourceType;
  readonly priority: number;
  readonly capabilities: ContentSourceCapabilities;

  // 生命周期
  initialize(): Promise<void>;
  isAvailable(): Promise<boolean>;
  dispose?(): Promise<void>;

  // 内容读取
  getContent(id: string): Promise<ContentItem | null>;
  getContentBySlug(slug: string, type?: ContentType): Promise<ContentItem | null>;
  listContent(options?: ListContentOptions): Promise<ContentItem[]>;
  getContentIndex(): Promise<ContentIndex[]>;

  // 内容写入（可选）
  createContent?(input: CreateContentInput): Promise<ContentItem>;
  updateContent?(id: string, input: UpdateContentInput): Promise<ContentItem>;
  deleteContent?(id: string): Promise<void>;

  // 文件操作（可选）
  uploadFile?(path: string, content: Buffer | string): Promise<string>;
  downloadFile?(path: string): Promise<Buffer>;
  renameFile?(oldPath: string, newPath: string): Promise<void>;

  // 目录操作（可选）
  createDirectory?(path: string): Promise<void>;
  deleteDirectory?(path: string): Promise<void>;
  listDirectories?(path?: string): Promise<DirectoryInfo[]>;

  // 批量操作（可选）
  batchCreateContent?(inputs: CreateContentInput[]): Promise<ContentItem[]>;
  batchUpdateContent?(updates: BatchUpdateInput[]): Promise<ContentItem[]>;
  batchDeleteContent?(ids: string[]): Promise<void>;

  // 搜索功能（可选）
  searchContent?(query: string, options?: SearchOptions): Promise<ContentItem[]>;

  // 缓存和同步
  refreshIndex?(): Promise<void>;
  getLastModified?(id: string): Promise<Date | null>;
  checkChanges?(since?: Date): Promise<ChangeInfo[]>;
}

// 内容缓存接口
export interface ContentCache {
  get(key: string): Promise<ContentItem | null>;
  set(key: string, value: ContentItem, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  invalidate(pattern?: string): Promise<void>;
  getStats(): Promise<{
    size: number;
    hits: number;
    misses: number;
  }>;
}

// 错误类型
export class ContentSourceError extends Error {
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

export class ContentNotFoundError extends ContentSourceError {
  constructor(id: string, source: string) {
    super(`Content not found: ${id}`, source, 'CONTENT_NOT_FOUND');
    this.name = 'ContentNotFoundError';
  }
}

export class ContentSourceUnavailableError extends ContentSourceError {
  constructor(source: string, cause?: Error) {
    super(`Content source unavailable: ${source}`, source, 'SOURCE_UNAVAILABLE', cause);
    this.name = 'ContentSourceUnavailableError';
  }
}

export class UnsupportedOperationError extends ContentSourceError {
  constructor(operation: string, source: string) {
    super(`Unsupported operation: ${operation}`, source, 'UNSUPPORTED_OPERATION');
    this.name = 'UnsupportedOperationError';
  }
}
