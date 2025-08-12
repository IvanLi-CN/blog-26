/**
 * 多源内容采集系统 - 类型定义
 *
 * 定义了内容源接口、内容项类型和相关数据结构
 * 支持本地文件系统、WebDAV 等多种内容源
 */

// ============================================================================
// 基础类型定义
// ============================================================================

/**
 * 内容类型枚举
 */
export type ContentType = "post" | "project" | "memo";

/**
 * 内容源类型枚举
 */
export type ContentSourceType = "local" | "webdav" | "database";

/**
 * 同步操作类型
 */
export type SyncOperationType = "create" | "update" | "delete" | "skip";

/**
 * 同步状态枚举
 */
export type SyncStatus = "idle" | "running" | "success" | "error" | "cancelled";

// ============================================================================
// 内容项相关类型
// ============================================================================

/**
 * 内容项基础信息
 */
export interface ContentItem {
  /** 唯一标识符（通常是文件路径） */
  id: string;

  /** 内容类型 */
  type: ContentType;

  /** URL 友好的标识符 */
  slug: string;

  /** 标题 */
  title: string;

  /** 摘要/描述 */
  excerpt?: string;

  /** 内容哈希值（用于变更检测） */
  contentHash: string;

  /** 最后修改时间（Unix 时间戳） */
  lastModified: number;

  /** 内容源标识 */
  source: string;

  /** 原始文件路径 */
  filePath: string;

  /** 是否为草稿 */
  draft: boolean;

  /** 是否公开 */
  public: boolean;

  /** 发布日期（Unix 时间戳） */
  publishDate: number;

  /** 更新日期（Unix 时间戳，可选） */
  updateDate?: number;

  /** 分类 */
  category?: string;

  /** 标签列表 */
  tags: string[];

  /** 作者 */
  author?: string;

  /** 封面图片 */
  image?: string;

  /** 其他元数据 */
  metadata: Record<string, unknown>;
}

/**
 * 内容变更信息
 */
export interface ContentChange {
  /** 内容项 */
  item: ContentItem;

  /** 操作类型 */
  operation: SyncOperationType;

  /** 变更原因 */
  reason: string;

  /** 原始内容（用于更新操作） */
  rawContent?: string;
}

/**
 * 变更集合
 */
export interface ChangeSet {
  /** 内容源名称 */
  sourceName: string;

  /** 变更列表 */
  changes: ContentChange[];

  /** 检测时间 */
  detectedAt: number;

  /** 统计信息 */
  stats: {
    total: number;
    created: number;
    updated: number;
    deleted: number;
    skipped: number;
  };
}

// ============================================================================
// 内容源接口
// ============================================================================

/**
 * 内容源配置接口
 */
export interface ContentSourceConfig {
  /** 内容源名称 */
  name: string;

  /** 优先级（数值越大优先级越高） */
  priority: number;

  /** 是否启用 */
  enabled: boolean;

  /** 内容类型过滤器 */
  contentTypes?: ContentType[];

  /** 其他配置参数 */
  options: Record<string, unknown>;
}

/**
 * 内容源抽象接口
 */
export interface IContentSource {
  /** 内容源名称 */
  readonly name: string;

  /** 内容源类型 */
  readonly type: ContentSourceType;

  /** 优先级 */
  readonly priority: number;

  /** 是否启用 */
  readonly enabled: boolean;

  /**
   * 初始化内容源
   */
  initialize(): Promise<void>;

  /**
   * 获取所有内容项列表
   */
  listContent(): Promise<ContentItem[]>;

  /**
   * 获取指定路径的原始内容
   * @param filePath 文件路径
   */
  getContent(filePath: string): Promise<string>;

  /**
   * 检测内容变更
   * @param lastSyncTime 上次同步时间
   */
  detectChanges(lastSyncTime?: number): Promise<ChangeSet>;

  /**
   * 验证内容源连接
   */
  validateConnection(): Promise<boolean>;

  /**
   * 获取内容源状态信息
   */
  getStatus(): Promise<ContentSourceStatus>;

  /**
   * 清理资源
   */
  dispose(): Promise<void>;
}

// ============================================================================
// 同步相关类型
// ============================================================================

/**
 * 内容源状态
 */
export interface ContentSourceStatus {
  /** 内容源名称 */
  name: string;

  /** 是否在线/可用 */
  online: boolean;

  /** 最后同步时间 */
  lastSyncTime?: number;

  /** 内容项总数 */
  totalItems: number;

  /** 错误信息 */
  error?: string;

  /** 额外状态信息 */
  metadata: Record<string, unknown>;
}

/**
 * 同步进度信息
 */
export interface SyncProgress {
  /** 当前状态 */
  status: SyncStatus;

  /** 当前处理的内容源 */
  currentSource?: string;

  /** 总进度百分比 (0-100) */
  progress: number;

  /** 当前步骤描述 */
  currentStep: string;

  /** 已处理项目数 */
  processedItems: number;

  /** 总项目数 */
  totalItems: number;

  /** 开始时间 */
  startTime: number;

  /** 预估剩余时间（毫秒） */
  estimatedTimeRemaining?: number;

  /** 错误信息 */
  error?: string;
}

/**
 * 同步结果
 */
export interface SyncResult {
  /** 是否成功 */
  success: boolean;

  /** 同步开始时间 */
  startTime: number;

  /** 同步结束时间 */
  endTime: number;

  /** 处理的内容源列表 */
  sources: string[];

  /** 统计信息 */
  stats: {
    totalProcessed: number;
    created: number;
    updated: number;
    deleted: number;
    skipped: number;
    errors: number;
  };

  /** 错误列表 */
  errors: SyncError[];

  /** 详细日志 */
  logs: SyncLogEntry[];
}

/**
 * 同步错误
 */
export interface SyncError {
  /** 错误来源 */
  source: string;

  /** 错误类型 */
  type: "network" | "parse" | "validation" | "database" | "unknown";

  /** 错误消息 */
  message: string;

  /** 相关文件路径 */
  filePath?: string;

  /** 错误堆栈 */
  stack?: string;

  /** 发生时间 */
  timestamp: number;
}

/**
 * 同步日志条目
 */
export interface SyncLogEntry {
  /** 日志级别 */
  level: "debug" | "info" | "warn" | "error";

  /** 日志消息 */
  message: string;

  /** 相关内容源 */
  source?: string;

  /** 相关文件路径 */
  filePath?: string;

  /** 额外数据 */
  data?: Record<string, unknown>;

  /** 时间戳 */
  timestamp: number;
}

// ============================================================================
// 工具类型
// ============================================================================

/**
 * 内容解析结果
 */
export interface ParsedContent {
  /** 前置元数据 */
  frontmatter: Record<string, unknown>;

  /** 正文内容 */
  body: string;

  /** 内容哈希 */
  contentHash: string;

  /** 解析时间 */
  parsedAt: number;
}

/**
 * 文件信息
 */
export interface FileInfo {
  /** 文件路径 */
  path: string;

  /** 文件名 */
  name: string;

  /** 文件扩展名 */
  extension: string;

  /** 文件大小（字节） */
  size: number;

  /** 最后修改时间 */
  lastModified: number;

  /** ETag（如果可用） */
  etag?: string;

  /** 是否为目录 */
  isDirectory: boolean;
}
