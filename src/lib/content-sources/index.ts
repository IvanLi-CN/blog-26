/**
 * 多源内容采集系统 - 入口文件
 *
 * 导出所有公共接口和类型
 */

// 抽象基类
export {
  ContentSourceBase,
  type ContentSourceFactory,
  ContentSourceFactoryBase,
} from "./base";
// 具体实现
export {
  LocalContentSource,
  type LocalContentSourceConfig,
} from "./local";
export {
  type ContentMergeStrategy,
  ContentSourceManager,
  type ContentSourceManagerConfig,
  createContentSourceManager,
  getContentSourceManager,
  resetContentSourceManager,
} from "./manager";
// 类型定义
export type {
  ChangeSet,
  ContentChange,
  ContentItem,
  ContentSourceConfig,
  ContentSourceStatus,
  ContentSourceType,
  ContentType,
  FileInfo,
  IContentSource,
  ParsedContent,
  SyncError,
  SyncLogEntry,
  SyncOperationType,
  SyncProgress,
  SyncResult,
  SyncStatus,
} from "./types";
// 工具函数
export {
  calculateContentHash,
  calculateFileInfoHash,
  createContentItemFromParsed,
  generateSlugFromPath,
  inferContentTypeFromPath,
  isMarkdownFile,
  normalizePath,
  parseMarkdownContent,
  sanitizeContentItem,
  validateContentItem,
} from "./utils";
export {
  WebDAVContentSource,
  type WebDAVContentSourceConfig,
} from "./webdav";

// 版本信息
export const VERSION = "1.0.0";
export const SUPPORTED_CONTENT_TYPES = ["post", "project", "memo"] as const;
export const SUPPORTED_SOURCE_TYPES = ["local", "webdav", "database"] as const;
