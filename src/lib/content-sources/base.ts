/**
 * 多源内容采集系统 - 抽象基类
 *
 * 提供内容源的基础实现和通用方法
 */

import type {
  ChangeSet,
  ContentItem,
  ContentSourceConfig,
  ContentSourceStatus,
  ContentSourceType,
  IContentSource,
  SyncLogEntry,
  SyncOperationType,
} from "./types";

/**
 * 内容源抽象基类
 *
 * 提供内容源的基础实现，具体的内容源类需要继承此类并实现抽象方法
 */
export abstract class ContentSourceBase implements IContentSource {
  public readonly name: string;
  public readonly type: ContentSourceType;
  public readonly priority: number;
  public readonly enabled: boolean;

  protected config: ContentSourceConfig;
  protected logs: SyncLogEntry[] = [];
  protected isInitialized = false;

  constructor(config: ContentSourceConfig, type: ContentSourceType) {
    this.name = config.name;
    this.type = type;
    this.priority = config.priority;
    this.enabled = config.enabled;
    this.config = config;
  }

  // ============================================================================
  // 抽象方法 - 子类必须实现
  // ============================================================================

  /**
   * 初始化内容源连接
   */
  abstract initialize(): Promise<void>;

  /**
   * 获取所有内容项列表
   */
  abstract listContent(): Promise<ContentItem[]>;

  /**
   * 获取指定路径的原始内容
   */
  abstract getContent(filePath: string): Promise<string>;

  /**
   * 验证内容源连接
   */
  abstract validateConnection(): Promise<boolean>;

  /**
   * 获取内容源特定的状态信息
   */
  protected abstract getSourceSpecificStatus(): Promise<Partial<ContentSourceStatus>>;

  // ============================================================================
  // 通用方法实现
  // ============================================================================

  /**
   * 检测内容变更
   */
  async detectChanges(lastSyncTime?: number): Promise<ChangeSet> {
    this.log(
      "info",
      `开始检测内容变更，上次同步时间: ${lastSyncTime ? new Date(lastSyncTime).toISOString() : "无"}`
    );

    try {
      const currentItems = await this.listContent();
      const changes = await this.compareWithLastSync(currentItems, lastSyncTime);

      const stats = {
        total: changes.length,
        created: changes.filter((c) => c.operation === "create").length,
        updated: changes.filter((c) => c.operation === "update").length,
        deleted: 0, // 当前实现不支持删除检测
        skipped: 0, // 当前实现不支持跳过检测
      };

      this.log("info", `变更检测完成: ${JSON.stringify(stats)}`);

      return {
        sourceName: this.name,
        changes,
        detectedAt: Date.now(),
        stats,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log("error", `变更检测失败: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * 获取内容源状态
   */
  async getStatus(): Promise<ContentSourceStatus> {
    try {
      const isOnline = await this.validateConnection();
      const specificStatus = await this.getSourceSpecificStatus();

      return {
        name: this.name,
        online: isOnline,
        totalItems: 0, // 子类可以覆盖
        metadata: {
          type: this.type,
          priority: this.priority,
          enabled: this.enabled,
          initialized: this.isInitialized,
        },
        ...specificStatus,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        name: this.name,
        online: false,
        totalItems: 0,
        error: errorMessage,
        metadata: {
          type: this.type,
          priority: this.priority,
          enabled: this.enabled,
          initialized: this.isInitialized,
        },
      };
    }
  }

  /**
   * 清理资源
   */
  async dispose(): Promise<void> {
    this.log("info", "正在清理内容源资源");
    this.logs = [];
    this.isInitialized = false;
  }

  // ============================================================================
  // 受保护的工具方法
  // ============================================================================

  /**
   * 记录日志
   */
  protected log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    filePath?: string,
    data?: Record<string, unknown>
  ): void {
    const logEntry: SyncLogEntry = {
      level,
      message,
      source: this.name,
      filePath,
      data,
      timestamp: Date.now(),
    };

    this.logs.push(logEntry);

    // 限制日志数量，避免内存泄漏
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(-500);
    }

    // 输出到控制台（开发环境）
    if (process.env.NODE_ENV === "development") {
      const prefix = `[${this.name}]`;
      switch (level) {
        case "debug":
          console.debug(prefix, message, data);
          break;
        case "info":
          console.info(prefix, message, data);
          break;
        case "warn":
          console.warn(prefix, message, data);
          break;
        case "error":
          console.error(prefix, message, data);
          break;
      }
    }
  }

  /**
   * 获取日志
   */
  getLogs(): SyncLogEntry[] {
    return [...this.logs];
  }

  /**
   * 清空日志
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * 检查是否已初始化
   */
  protected ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error(`内容源 ${this.name} 尚未初始化，请先调用 initialize() 方法`);
    }
  }

  /**
   * 比较当前内容与上次同步的差异
   */
  private async compareWithLastSync(currentItems: ContentItem[], lastSyncTime?: number) {
    const changes = [];

    // 延迟导入数据库模块,避免在非运行时环境(如测试初始化)中导入
    let db: any;
    let posts: any;
    let eq: any;

    // 只在需要查询时才导入数据库模块
    const needsDatabaseQuery = currentItems.some(
      (item) => lastSyncTime && item.lastModified > lastSyncTime
    );

    if (needsDatabaseQuery) {
      try {
        const dbModule = await import("~/server/db");
        const schemaModule = await import("~/server/db/schema");
        const ormModule = await import("drizzle-orm");
        db = dbModule.db;
        posts = schemaModule.posts;
        eq = ormModule.eq;
      } catch (error) {
        // 如果数据库模块导入失败(如在测试初始化期间),退回到基于时间的判断
        console.warn(
          `[${this.name}] Failed to import database modules, falling back to time-based sync:`,
          error
        );
      }
    }

    for (const item of currentItems) {
      // 如果没有上次同步时间，认为所有项目都是新的
      if (!lastSyncTime) {
        changes.push({
          item,
          operation: "create" as SyncOperationType,
          reason: "首次同步",
        });
        continue;
      }

      // 如果项目的修改时间早于或等于上次同步时间，跳过
      if (item.lastModified <= lastSyncTime) {
        continue;
      }

      // 查询数据库检查item是否已存在
      let existingItem: any;
      if (db && posts && eq) {
        try {
          existingItem = await db
            .select({ id: posts.id })
            .from(posts)
            .where(eq(posts.id, item.id))
            .limit(1)
            .then((result: any[]) => result[0]);
        } catch (error) {
          console.warn(
            `[${this.name}] Failed to query database for item ${item.id}, assuming it's new:`,
            error
          );
        }
      }

      changes.push({
        item,
        operation: existingItem ? ("update" as SyncOperationType) : ("create" as SyncOperationType),
        reason: existingItem ? "内容已修改" : "新增内容",
      });
    }

    return changes;
  }

  // ============================================================================
  // 静态工具方法
  // ============================================================================

  /**
   * 验证内容源配置
   */
  static validateConfig(config: ContentSourceConfig): boolean {
    if (!config.name || typeof config.name !== "string") {
      throw new Error("内容源名称不能为空");
    }

    if (typeof config.priority !== "number" || config.priority < 0) {
      throw new Error("内容源优先级必须是非负数");
    }

    if (typeof config.enabled !== "boolean") {
      throw new Error("内容源启用状态必须是布尔值");
    }

    return true;
  }

  /**
   * 创建默认配置
   */
  static createDefaultConfig(
    name: string,
    priority: number = 50,
    options: Record<string, unknown> = {}
  ): ContentSourceConfig {
    return {
      name,
      priority,
      enabled: true,
      options,
    };
  }
}

/**
 * 内容源工厂接口
 */
export interface ContentSourceFactory<T extends ContentSourceBase> {
  create(config: ContentSourceConfig): T;
  validateConfig(config: ContentSourceConfig): boolean;
}

/**
 * 抽象内容源工厂基类
 */
export abstract class ContentSourceFactoryBase<T extends ContentSourceBase>
  implements ContentSourceFactory<T>
{
  abstract create(config: ContentSourceConfig): T;

  validateConfig(config: ContentSourceConfig): boolean {
    return ContentSourceBase.validateConfig(config);
  }
}
