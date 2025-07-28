/**
 * 多源内容数据源架构 - 多源管理器
 *
 * 负责管理多个数据源实例，实现读写策略、冲突解决等核心功能
 */

import type {
  ContentDataSource,
  ContentIndex,
  ContentItem,
  ContentType,
  CreateContentInput,
  ListContentOptions,
  MultiSourceConfig,
  SyncOptions,
  SyncResult,
  UpdateContentInput,
} from './types';
import { ContentNotFoundError, ContentSourceError, ContentSourceUnavailableError } from './types';

/**
 * 多源内容管理器
 * 统一管理多个内容数据源，提供统一的API接口
 */
export class MultiSourceContentManager {
  private dataSources: Map<string, ContentDataSource> = new Map();
  private config: MultiSourceConfig;

  constructor(config: MultiSourceConfig) {
    this.config = config;
  }

  /**
   * 注册数据源
   * @param source 数据源实例
   */
  async registerDataSource(source: ContentDataSource): Promise<void> {
    try {
      await source.initialize();
      this.dataSources.set(source.name, source);
      console.log(`📝 已注册数据源: ${source.name}`);
    } catch (error) {
      throw new ContentSourceError(
        `Failed to register data source ${source.name}: ${error.message}`,
        source.name,
        'REGISTRATION_FAILED',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 注销数据源
   * @param name 数据源名称
   */
  async unregisterDataSource(name: string): Promise<void> {
    const source = this.dataSources.get(name);
    if (source?.dispose) {
      await source.dispose();
    }
    this.dataSources.delete(name);
    console.log(`🗑️ 已注销数据源: ${name}`);
  }

  /**
   * 获取所有已注册的数据源
   */
  getDataSources(): ContentDataSource[] {
    return Array.from(this.dataSources.values());
  }

  /**
   * 获取指定名称的数据源
   * @param name 数据源名称
   */
  getDataSource(name: string): ContentDataSource | undefined {
    return this.dataSources.get(name);
  }

  /**
   * 按优先级排序的数据源列表
   */
  private getSortedDataSources(): ContentDataSource[] {
    return Array.from(this.dataSources.values()).sort((a, b) => a.priority - b.priority);
  }

  /**
   * 获取可用的数据源列表
   */
  private async getAvailableDataSources(): Promise<ContentDataSource[]> {
    const sources = this.getSortedDataSources();
    const availableSources: ContentDataSource[] = [];

    for (const source of sources) {
      try {
        if (await source.isAvailable()) {
          availableSources.push(source);
        }
      } catch (error) {
        console.warn(`数据源 ${source.name} 可用性检查失败:`, error);
      }
    }

    return availableSources;
  }

  /**
   * 获取内容（按数据源定义顺序，后定义的覆盖前面的）
   * @param id 内容ID
   */
  async getContent(id: string): Promise<ContentItem | null> {
    return this.getContentByOrder(id);
  }

  /**
   * 按数据源定义顺序获取内容（后定义的覆盖前面的）
   */
  private async getContentByOrder(id: string): Promise<ContentItem | null> {
    const sources = await this.getAvailableDataSources();

    for (const source of sources) {
      if (source.capabilities.read) {
        try {
          const content = await source.getContent(id);
          if (content) {
            return content;
          }
        } catch (error) {
          console.warn(`从数据源 ${source.name} 获取内容失败:`, error);
        }
      }
    }

    return null;
  }

  /**
   * 通过slug获取内容
   * @param slug 内容slug
   * @param type 内容类型
   */
  async getContentBySlug(slug: string, type?: ContentType): Promise<ContentItem | null> {
    const sources = await this.getAvailableDataSources();

    for (const source of sources) {
      if (source.capabilities.read) {
        try {
          const content = await source.getContentBySlug(slug, type);
          if (content) {
            return content;
          }
        } catch (error) {
          console.warn(`从数据源 ${source.name} 通过slug获取内容失败:`, error);
        }
      }
    }

    return null;
  }

  /**
   * 列出内容（按数据源定义顺序，根据slug去重合并，后定义的覆盖前面的）
   * @param options 列表选项
   */
  async listContent(options?: ListContentOptions): Promise<ContentItem[]> {
    const contentMap = new Map<string, ContentItem>();

    const sources = await this.getAvailableDataSources();
    for (const source of sources) {
      if (source.capabilities.read) {
        try {
          const items = await source.listContent(options);
          for (const item of items) {
            // 使用slug作为key，后面的数据源会覆盖前面的
            contentMap.set(item.slug, item);
          }
        } catch (error) {
          console.warn(`从数据源 ${source.name} 列出内容失败:`, error);
        }
      }
    }

    // 转换为数组并按发布日期排序
    const results = Array.from(contentMap.values());
    return results.sort((a, b) => b.publishDate.getTime() - a.publishDate.getTime());
  }

  /**
   * 获取内容索引（按数据源定义顺序，根据slug去重合并，后定义的覆盖前面的）
   */
  async getContentIndex(): Promise<ContentIndex[]> {
    const indexMap = new Map<string, ContentIndex>();

    const sources = await this.getAvailableDataSources();
    for (const source of sources) {
      if (source.capabilities.read) {
        try {
          const indexes = await source.getContentIndex();
          for (const index of indexes) {
            // 使用slug作为key，后面的数据源会覆盖前面的
            indexMap.set(index.slug, index);
          }
        } catch (error) {
          console.warn(`从数据源 ${source.name} 获取内容索引失败:`, error);
        }
      }
    }

    const results = Array.from(indexMap.values());
    return results.sort((a, b) => b.publishDate.getTime() - a.publishDate.getTime());
  }

  /**
   * 获取可写数据源（使用第一个支持写入的数据源）
   * @param targetSource 指定的目标数据源名称
   */
  private getWritableDataSource(targetSource?: string): ContentDataSource {
    if (targetSource) {
      const source = this.dataSources.get(targetSource);
      if (!source) {
        throw new ContentSourceError(`Data source ${targetSource} not found`, targetSource, 'SOURCE_NOT_FOUND');
      }
      if (!source.capabilities.write) {
        throw new ContentSourceError(`Data source ${targetSource} is not writable`, targetSource, 'NOT_WRITABLE');
      }
      return source;
    }

    // 使用第一个支持写入的数据源
    const sources = this.getSortedDataSources();
    for (const source of sources) {
      if (source.capabilities.write) {
        return source;
      }
    }

    throw new ContentSourceError('No writable data source found', 'multi-source', 'NO_WRITABLE_SOURCE');
  }

  /**
   * 创建内容
   * @param input 创建输入
   * @param targetSource 目标数据源名称
   */
  async createContent(input: CreateContentInput, targetSource?: string): Promise<ContentItem> {
    const source = this.getWritableDataSource(targetSource);

    if (!source.createContent) {
      throw new ContentSourceError(
        `Data source ${source.name} does not support content creation`,
        source.name,
        'UNSUPPORTED_OPERATION'
      );
    }

    try {
      const result = await source.createContent(input);
      console.log(`✅ 已在数据源 ${source.name} 中创建内容: ${result.id}`);
      return result;
    } catch (error) {
      throw new ContentSourceError(
        `Failed to create content in ${source.name}: ${error.message}`,
        source.name,
        'CREATE_FAILED',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 更新内容
   * @param id 内容ID
   * @param input 更新输入
   */
  async updateContent(id: string, input: UpdateContentInput): Promise<ContentItem> {
    // 找到包含该内容的数据源
    const source = await this.findContentSource(id);
    if (!source?.updateContent) {
      throw new ContentNotFoundError(id, 'multi-source');
    }

    try {
      const result = await source.updateContent(id, input);
      console.log(`✅ 已在数据源 ${source.name} 中更新内容: ${id}`);
      return result;
    } catch (error) {
      throw new ContentSourceError(
        `Failed to update content ${id} in ${source.name}: ${error.message}`,
        source.name,
        'UPDATE_FAILED',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 删除内容
   * @param id 内容ID
   */
  async deleteContent(id: string): Promise<void> {
    const source = await this.findContentSource(id);
    if (!source?.deleteContent) {
      throw new ContentNotFoundError(id, 'multi-source');
    }

    try {
      await source.deleteContent(id);
      console.log(`🗑️ 已从数据源 ${source.name} 中删除内容: ${id}`);
    } catch (error) {
      throw new ContentSourceError(
        `Failed to delete content ${id} from ${source.name}: ${error.message}`,
        source.name,
        'DELETE_FAILED',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 查找包含指定内容的数据源
   * @param id 内容ID
   */
  private async findContentSource(id: string): Promise<ContentDataSource | null> {
    const sources = await this.getAvailableDataSources();

    for (const source of sources) {
      if (source.capabilities.read) {
        try {
          const content = await source.getContent(id);
          if (content) {
            return source;
          }
        } catch (error) {
          console.warn(`检查数据源 ${source.name} 中的内容失败:`, error);
        }
      }
    }

    return null;
  }

  /**
   * 同步所有数据源
   * @param options 同步选项
   */
  async syncContent(options?: SyncOptions): Promise<SyncResult> {
    const results: SyncResult = {
      updated: 0,
      created: 0,
      deleted: 0,
      errors: [],
    };

    const sources = this.getSortedDataSources();

    for (const source of sources) {
      try {
        if (source.refreshIndex) {
          await source.refreshIndex();
        }

        if (source.checkChanges) {
          const changes = await source.checkChanges(options?.since);
          // TODO: 处理变更统计
          console.log(`数据源 ${source.name} 检测到 ${changes.length} 个变更`);
        }
      } catch (error) {
        results.errors.push({
          source: source.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * 搜索内容（按数据源定义顺序，根据slug去重合并，后定义的覆盖前面的）
   * @param query 搜索查询
   * @param options 搜索选项
   */
  async searchContent(query: string, options?: any): Promise<ContentItem[]> {
    const contentMap = new Map<string, ContentItem>();

    const sources = await this.getAvailableDataSources();

    for (const source of sources) {
      if (source.capabilities.search && source.searchContent) {
        try {
          const items = await source.searchContent(query, options);
          for (const item of items) {
            // 使用slug作为key，后面的数据源会覆盖前面的
            contentMap.set(item.slug, item);
          }
        } catch (error) {
          console.warn(`在数据源 ${source.name} 中搜索失败:`, error);
        }
      }
    }

    const results = Array.from(contentMap.values());
    return results.sort((a, b) => b.publishDate.getTime() - a.publishDate.getTime());
  }

  /**
   * 获取管理器状态信息
   */
  getManagerInfo(): {
    totalSources: number;
    enabledSources: number;
    config: MultiSourceConfig;
    sources: Array<{
      name: string;
      type: string;
      priority: number;
      capabilities: any;
    }>;
  } {
    const sources = this.getDataSources();

    return {
      totalSources: sources.length,
      enabledSources: sources.length, // 已注册的都是启用的
      config: this.config,
      sources: sources.map((source) => ({
        name: source.name,
        type: source.type,
        priority: source.priority,
        capabilities: source.capabilities,
      })),
    };
  }

  /**
   * 销毁管理器，清理所有资源
   */
  async dispose(): Promise<void> {
    const sources = Array.from(this.dataSources.keys());

    for (const sourceName of sources) {
      await this.unregisterDataSource(sourceName);
    }

    this.dataSources.clear();
    console.log('🧹 多源内容管理器已销毁');
  }
}
