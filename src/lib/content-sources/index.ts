/**
 * 多源内容数据源架构 - 主入口
 *
 * 导出所有核心组件和类型定义
 */

// 抽象基类
export { BaseContentDataSource } from './base';
// 工厂类
export { ContentSourceFactory } from './factory';
// 全局管理器
export {
  createContent,
  deleteContent,
  getContent,
  getContentBySlug,
  getContentIndex,
  getGlobalContentManager,
  getGlobalContentManagerInfo,
  isGlobalContentManagerInitialized,
  listContent,
  resetGlobalContentManager,
  searchContent,
  syncContent,
  updateContent,
} from './global';
// 具体数据源实现
export { LocalFileSystemDataSource } from './local';

// 多源管理器
export { MultiSourceContentManager } from './manager';
// 注册和初始化
export {
  getDefaultMultiSourceConfig,
  initializeMultiSourceManager,
  registerBuiltinDataSources,
} from './registry';
// 核心类型和接口
export type {
  BatchUpdateInput,
  ChangeInfo,
  ContentCache,
  ContentDataSource,
  ContentIndex,
  ContentSourceCapabilities,
  CreateContentInput,
  DataSourceConfig,
  DataSourceType,
  DirectoryInfo,
  ListContentOptions,
  MultiSourceConfig,
  SearchOptions,
  SyncOptions,
  SyncResult,
  UpdateContentInput,
} from './types';
// 错误类型
export {
  ContentNotFoundError,
  ContentSourceError,
  ContentSourceUnavailableError,
  UnsupportedOperationError,
} from './types';
export { WebDAVDataSource } from './webdav';

// 便捷的创建函数
export async function createMultiSourceManager(config: any) {
  const { ContentSourceFactory } = await import('./factory');
  return ContentSourceFactory.createMultiSourceManager(config);
}

// 版本信息
export const VERSION = '1.0.0';
export const ARCHITECTURE_NAME = 'Multi-Source Content Data Source Architecture';
