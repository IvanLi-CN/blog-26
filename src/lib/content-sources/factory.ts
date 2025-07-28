/**
 * 多源内容数据源架构 - 工厂类
 *
 * 负责根据配置创建不同类型的数据源实例
 */

import type { ContentDataSource, DataSourceConfig, DataSourceType, MultiSourceConfig } from './types';
import { ContentSourceError } from './types';

// 数据源构造函数类型
type DataSourceConstructor = new (config: DataSourceConfig) => ContentDataSource;

/**
 * 内容数据源工厂类
 * 使用注册模式支持不同类型的数据源
 */
export class ContentSourceFactory {
  private static readonly sourceTypes = new Map<DataSourceType, DataSourceConstructor>();

  /**
   * 注册数据源类型
   * @param type 数据源类型
   * @param sourceClass 数据源类构造函数
   */
  static registerSourceType(type: DataSourceType, sourceClass: DataSourceConstructor): void {
    this.sourceTypes.set(type, sourceClass);
    console.log(`✅ 已注册数据源类型: ${type}`);
  }

  /**
   * 获取已注册的数据源类型列表
   */
  static getRegisteredTypes(): DataSourceType[] {
    return Array.from(this.sourceTypes.keys());
  }

  /**
   * 检查数据源类型是否已注册
   * @param type 数据源类型
   */
  static isTypeRegistered(type: DataSourceType): boolean {
    return this.sourceTypes.has(type);
  }

  /**
   * 创建单个数据源实例
   * @param config 数据源配置
   */
  static async createDataSource(config: DataSourceConfig): Promise<ContentDataSource> {
    const SourceClass = this.sourceTypes.get(config.type);
    if (!SourceClass) {
      throw new ContentSourceError(`Unsupported data source type: ${config.type}`, config.name, 'UNSUPPORTED_TYPE');
    }

    try {
      const source = new SourceClass(config);
      console.log(`📦 创建数据源实例: ${config.name} (${config.type})`);
      return source;
    } catch (error) {
      throw new ContentSourceError(
        `Failed to create data source ${config.name}: ${error.message}`,
        config.name,
        'CREATION_FAILED',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 验证数据源配置
   * @param config 数据源配置
   */
  static validateConfig(config: DataSourceConfig): void {
    if (!config.name) {
      throw new ContentSourceError('Data source name is required', 'unknown', 'INVALID_CONFIG');
    }

    if (!config.type) {
      throw new ContentSourceError('Data source type is required', config.name, 'INVALID_CONFIG');
    }

    if (!this.isTypeRegistered(config.type)) {
      throw new ContentSourceError(`Unsupported data source type: ${config.type}`, config.name, 'UNSUPPORTED_TYPE');
    }

    if (typeof config.priority !== 'number') {
      throw new ContentSourceError('Data source priority must be a number', config.name, 'INVALID_CONFIG');
    }

    if (typeof config.enabled !== 'boolean') {
      throw new ContentSourceError('Data source enabled flag must be a boolean', config.name, 'INVALID_CONFIG');
    }
  }

  /**
   * 验证多源配置
   * @param config 多源配置
   */
  static validateMultiSourceConfig(config: MultiSourceConfig): void {
    if (!config.dataSources || !Array.isArray(config.dataSources)) {
      throw new ContentSourceError('Data sources configuration must be an array', 'multi-source', 'INVALID_CONFIG');
    }

    if (config.dataSources.length === 0) {
      throw new ContentSourceError('At least one data source must be configured', 'multi-source', 'INVALID_CONFIG');
    }

    // 验证每个数据源配置
    for (const sourceConfig of config.dataSources) {
      this.validateConfig(sourceConfig);
    }

    // 验证数据源名称唯一性
    const names = config.dataSources.map((s) => s.name);
    const uniqueNames = new Set(names);
    if (names.length !== uniqueNames.size) {
      throw new ContentSourceError('Data source names must be unique', 'multi-source', 'INVALID_CONFIG');
    }

    // 验证缓存配置
    if (!config.cache) {
      throw new ContentSourceError('Cache configuration is required', 'multi-source', 'INVALID_CONFIG');
    }
  }

  /**
   * 创建多源内容管理器
   * @param config 多源配置
   */
  static async createMultiSourceManager(config: MultiSourceConfig): Promise<any> {
    // 验证配置
    this.validateMultiSourceConfig(config);

    // 动态导入管理器类以避免循环依赖
    const { MultiSourceContentManager } = await import('./manager');
    const manager = new MultiSourceContentManager(config);

    // 按优先级排序并初始化数据源
    const sortedConfigs = config.dataSources.filter((c) => c.enabled).sort((a, b) => a.priority - b.priority);

    const initResults: Array<{ name: string; success: boolean; error?: string }> = [];

    for (const sourceConfig of sortedConfigs) {
      try {
        const source = await this.createDataSource(sourceConfig);
        await manager.registerDataSource(source);
        initResults.push({ name: source.name, success: true });
        console.log(`✅ 已注册数据源: ${source.name} (${source.type})`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        initResults.push({ name: sourceConfig.name, success: false, error: errorMessage });
        console.warn(`⚠️ 数据源初始化失败: ${sourceConfig.name}`, errorMessage);

        if (sourceConfig.required) {
          throw new ContentSourceError(
            `Required data source failed to initialize: ${sourceConfig.name}`,
            sourceConfig.name,
            'REQUIRED_SOURCE_FAILED',
            error instanceof Error ? error : new Error(String(error))
          );
        }
      }
    }

    // 检查是否至少有一个数据源成功初始化
    const successfulSources = initResults.filter((r) => r.success);
    if (successfulSources.length === 0) {
      throw new ContentSourceError(
        'No data sources were successfully initialized',
        'multi-source',
        'NO_SOURCES_AVAILABLE'
      );
    }

    console.log(`🎉 多源内容管理器初始化完成，成功注册 ${successfulSources.length} 个数据源`);
    return manager;
  }

  /**
   * 获取工厂状态信息
   */
  static getFactoryInfo(): {
    registeredTypes: DataSourceType[];
    typeCount: number;
  } {
    return {
      registeredTypes: this.getRegisteredTypes(),
      typeCount: this.sourceTypes.size,
    };
  }
}
