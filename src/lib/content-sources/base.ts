/**
 * 多源内容数据源架构 - 抽象基类
 *
 * 提供所有数据源实现的通用功能和验证逻辑
 */

import type {
  ContentDataSource,
  ContentIndex,
  ContentItem,
  ContentSourceCapabilities,
  ContentType,
  CreateContentInput,
  DataSourceConfig,
  DataSourceType,
  ListContentOptions,
  UpdateContentInput,
} from './types';
import { ContentSourceError, UnsupportedOperationError } from './types';

/**
 * 抽象基类，提供数据源的通用功能
 */
export abstract class BaseContentDataSource implements ContentDataSource {
  readonly name: string;
  readonly type: DataSourceType;
  readonly priority: number;
  readonly capabilities: ContentSourceCapabilities;

  protected config: DataSourceConfig;
  protected initialized: boolean = false;

  constructor(config: DataSourceConfig) {
    this.config = config;
    this.name = config.name;
    this.type = config.type;
    this.priority = config.priority;

    // 合并默认能力和配置中的能力
    const defaultCapabilities = this.getDefaultCapabilities();
    this.capabilities = {
      ...defaultCapabilities,
      ...config.capabilities,
    };
  }

  // 抽象方法，子类必须实现
  abstract initialize(): Promise<void>;
  abstract isAvailable(): Promise<boolean>;
  abstract getContent(id: string): Promise<ContentItem | null>;
  abstract listContent(options?: ListContentOptions): Promise<ContentItem[]>;
  abstract getContentIndex(): Promise<ContentIndex[]>;

  // 子类需要实现的默认能力定义
  protected abstract getDefaultCapabilities(): ContentSourceCapabilities;

  // 通用的验证方法
  protected ensureInitialized(): void {
    if (!this.initialized) {
      throw new ContentSourceError(`Data source ${this.name} is not initialized`, this.name, 'NOT_INITIALIZED');
    }
  }

  protected validateCapability(capability: keyof ContentSourceCapabilities): void {
    if (!this.capabilities[capability]) {
      throw new UnsupportedOperationError(capability, this.name);
    }
  }

  // 默认实现 - 通过slug获取内容
  async getContentBySlug(slug: string, type?: ContentType): Promise<ContentItem | null> {
    this.ensureInitialized();

    const options: ListContentOptions = {
      type: type || 'all',
    };

    const allContent = await this.listContent(options);
    return allContent.find((item) => item.slug === slug) || null;
  }

  // 可选方法的默认实现（抛出不支持错误）
  async createContent?(input: CreateContentInput): Promise<ContentItem> {
    this.validateCapability('write');
    throw new UnsupportedOperationError('createContent', this.name);
  }

  async updateContent?(id: string, input: UpdateContentInput): Promise<ContentItem> {
    this.validateCapability('write');
    throw new UnsupportedOperationError('updateContent', this.name);
  }

  async deleteContent?(id: string): Promise<void> {
    this.validateCapability('delete');
    throw new UnsupportedOperationError('deleteContent', this.name);
  }

  async uploadFile?(path: string, content: Buffer | string): Promise<string> {
    this.validateCapability('uploadFile');
    throw new UnsupportedOperationError('uploadFile', this.name);
  }

  async downloadFile?(path: string): Promise<Buffer> {
    this.validateCapability('downloadFile');
    throw new UnsupportedOperationError('downloadFile', this.name);
  }

  async renameFile?(oldPath: string, newPath: string): Promise<void> {
    this.validateCapability('renameFile');
    throw new UnsupportedOperationError('renameFile', this.name);
  }

  async createDirectory?(path: string): Promise<void> {
    this.validateCapability('createDirectory');
    throw new UnsupportedOperationError('createDirectory', this.name);
  }

  async deleteDirectory?(path: string): Promise<void> {
    this.validateCapability('delete');
    throw new UnsupportedOperationError('deleteDirectory', this.name);
  }

  async listDirectories?(path?: string): Promise<any[]> {
    this.validateCapability('read');
    throw new UnsupportedOperationError('listDirectories', this.name);
  }

  async batchCreateContent?(inputs: CreateContentInput[]): Promise<ContentItem[]> {
    this.validateCapability('batchOperations');
    this.validateCapability('write');

    // 默认实现：逐个创建
    const results: ContentItem[] = [];
    for (const input of inputs) {
      if (this.createContent) {
        const result = await this.createContent(input);
        results.push(result);
      }
    }
    return results;
  }

  async batchUpdateContent?(updates: any[]): Promise<ContentItem[]> {
    this.validateCapability('batchOperations');
    this.validateCapability('write');

    // 默认实现：逐个更新
    const results: ContentItem[] = [];
    for (const update of updates) {
      if (this.updateContent) {
        const result = await this.updateContent(update.id, update.input);
        results.push(result);
      }
    }
    return results;
  }

  async batchDeleteContent?(ids: string[]): Promise<void> {
    this.validateCapability('batchOperations');
    this.validateCapability('delete');

    // 默认实现：逐个删除
    for (const id of ids) {
      if (this.deleteContent) {
        await this.deleteContent(id);
      }
    }
  }

  async searchContent?(query: string, options?: any): Promise<ContentItem[]> {
    this.validateCapability('search');

    // 默认实现：简单的文本搜索
    const allContent = await this.listContent(options);
    const lowerQuery = query.toLowerCase();

    return allContent.filter(
      (item) =>
        item.title.toLowerCase().includes(lowerQuery) ||
        item.body.toLowerCase().includes(lowerQuery) ||
        (item.excerpt && item.excerpt.toLowerCase().includes(lowerQuery))
    );
  }

  async refreshIndex?(): Promise<void> {
    // 默认实现：什么都不做
    console.log(`Refresh index called on ${this.name}, but not implemented`);
  }

  async getLastModified?(id: string): Promise<Date | null> {
    // 默认实现：尝试从内容中获取
    const content = await this.getContent(id);
    return content?.updateDate || content?.publishDate || null;
  }

  async checkChanges?(since?: Date): Promise<any[]> {
    // 默认实现：返回空数组
    return [];
  }

  // 生命周期方法的默认实现
  async dispose?(): Promise<void> {
    this.initialized = false;
    console.log(`Data source ${this.name} disposed`);
  }

  // 工具方法
  protected logError(operation: string, error: Error): void {
    console.error(`[${this.name}] ${operation} failed:`, error);
  }

  protected logInfo(message: string): void {
    console.log(`[${this.name}] ${message}`);
  }

  protected logWarning(message: string): void {
    console.warn(`[${this.name}] ${message}`);
  }
}
