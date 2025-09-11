/**
 * 内容源管理器
 *
 * 统一管理多个内容源，处理内容合并、冲突解决和同步协调
 */

import { desc, eq, lt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, initializeDB } from "../db";
import type { ContentSyncLog } from "../schema";
import { contentSyncLogs, contentSyncStatus, posts } from "../schema";
import { syncEventManager } from "../sync-events";
import type {
  ChangeSet,
  ContentChange,
  ContentSourceStatus,
  IContentSource,
  SyncError,
  SyncLogEntry,
  SyncProgress,
  SyncResult,
  SyncStatus,
} from "./types";

/**
 * 内容源管理器配置
 */
export interface ContentSourceManagerConfig {
  /** 并发同步的最大数量 */
  maxConcurrentSyncs?: number;
  /** 同步超时时间（毫秒） */
  syncTimeout?: number;
  /** 是否启用事务 */
  enableTransactions?: boolean;
  /** 冲突解决策略 */
  conflictResolution?: "priority" | "timestamp" | "manual";
}

/**
 * 内容合并策略
 */
export interface ContentMergeStrategy {
  /** 优先级权重 */
  priorityWeight: number;
  /** 时间戳权重 */
  timestampWeight: number;
  /** 内容哈希权重 */
  hashWeight: number;
}

/**
 * 内容源管理器
 *
 * 负责协调多个内容源的同步、合并和冲突解决
 */
export class ContentSourceManager {
  private sources = new Map<string, IContentSource>();
  private config: Required<ContentSourceManagerConfig>;
  private currentSync: SyncProgress | null = null;
  private syncHistory: SyncResult[] = [];

  constructor(config: ContentSourceManagerConfig = {}) {
    this.config = {
      maxConcurrentSyncs: config.maxConcurrentSyncs || 3,
      syncTimeout: config.syncTimeout || 300000, // 5 分钟
      enableTransactions: config.enableTransactions !== false,
      conflictResolution: config.conflictResolution || "priority",
    };

    this.mergeStrategy = {
      priorityWeight: 0.6,
      timestampWeight: 0.3,
      hashWeight: 0.1,
    };

    // 确保数据库已初始化
    this.ensureDBInitialized();
  }

  /**
   * 确保数据库已初始化
   */
  private async ensureDBInitialized(): Promise<void> {
    try {
      // 在测试环境中，强制重新初始化以确保使用正确的数据库路径
      const isTestEnv = process.env.NODE_ENV === "test" || process.env.DB_PATH?.includes("test");
      await initializeDB(isTestEnv);
    } catch (error) {
      console.error("数据库初始化失败:", error);
    }
  }

  // ============================================================================
  // 内容源管理
  // ============================================================================

  /**
   * 注册内容源
   */
  async registerSource(source: IContentSource): Promise<void> {
    if (this.sources.has(source.name)) {
      throw new Error(`内容源 ${source.name} 已经注册`);
    }

    // 惰性注册：此处不做任何扫描/网络访问，仅登记源，真正的初始化与扫描在同步流程中进行
    this.sources.set(source.name, source);
    await this.logSync("info", `内容源 ${source.name} 已注册（惰性，不扫描）`);
  }

  /**
   * 注销内容源
   */
  async unregisterSource(sourceName: string): Promise<void> {
    const source = this.sources.get(sourceName);
    if (!source) {
      throw new Error(`内容源 ${sourceName} 不存在`);
    }

    await source.dispose();
    this.sources.delete(sourceName);
    await this.logSync("info", `内容源 ${sourceName} 注销成功`);
  }

  /**
   * 获取所有注册的内容源
   */
  getSources(): IContentSource[] {
    return Array.from(this.sources.values());
  }

  /**
   * 获取指定内容源
   */
  getSource(sourceName: string): IContentSource | undefined {
    return this.sources.get(sourceName);
  }

  // ============================================================================
  // 同步管理
  // ============================================================================

  /**
   * 执行同步操作
   * @param isFullSync 是否为全量同步。true: 清空数据库后重新同步所有内容；false: 增量同步，只处理变更内容
   */
  async syncAll(isFullSync: boolean = false): Promise<SyncResult> {
    if (this.currentSync && this.currentSync.status === "running") {
      throw new Error("同步正在进行中，请等待完成");
    }

    const startTime = Date.now();
    const syncId = nanoid();
    const syncType = isFullSync ? "全量同步" : "增量同步";

    // 启动推送会话
    console.log("🎯 ContentSourceManager 开始同步会话");
    console.log(
      "📍 ContentSourceManager syncEventManager 实例:",
      syncEventManager.constructor.name
    );
    console.log(
      "📍 ContentSourceManager syncEventManager 实例 ID:",
      (syncEventManager as any)._instanceId || "undefined"
    );
    const syncSessionId = syncEventManager.startSyncSession(isFullSync ? "full" : "incremental");
    console.log("✅ ContentSourceManager 同步会话已启动:", syncSessionId);

    this.currentSync = {
      status: "running",
      progress: 0,
      currentStep: `准备${syncType}`,
      processedItems: 0,
      totalItems: 0,
      startTime,
    };

    const result: SyncResult = {
      success: false,
      startTime,
      endTime: 0,
      sources: [],
      stats: {
        totalProcessed: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        skipped: 0,
        errors: 0,
      },
      errors: [],
      logs: [],
    };

    try {
      await this.logSync("info", `开始${syncType}`, undefined, { syncId, isFullSync });

      // 获取启用的内容源
      const enabledSources = Array.from(this.sources.values()).filter((source) => source.enabled);
      result.sources = enabledSources.map((source) => source.name);

      if (enabledSources.length === 0) {
        throw new Error("没有启用的内容源");
      }

      // 如果是全量同步，先清空数据库
      if (isFullSync) {
        this.currentSync.currentStep = "清空数据库";
        await this.logSync("info", "🗑️ 开始清空数据库中的所有内容");
        await this.clearAllContent();
        await this.logSync("info", "✅ 数据库清空完成");
      }

      // 更新同步状态
      this.currentSync.totalItems = enabledSources.length;
      this.currentSync.currentStep = "收集内容变更";

      // 先确保内容源完成轻量初始化（不触发扫描/网络开销）
      for (const source of enabledSources) {
        try {
          // initialize() 设计为轻量操作，不进行目录扫描/网络遍历
          await source.initialize();
        } catch (e) {
          await this.logSync(
            "warn",
            `内容源 ${source.name} 轻量初始化失败: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }

      // 并行收集所有内容源的变更（在 listContent/detectChanges 内部执行真实扫描）
      const changeSets = await this.collectChanges(enabledSources, isFullSync);

      // 合并和解决冲突
      this.currentSync.currentStep = "合并内容";
      const mergedChanges = await this.mergeChanges(changeSets);

      // 应用变更到数据库
      this.currentSync.currentStep = "应用变更";
      const applyResult = await this.applyChanges(mergedChanges);

      // 更新统计信息
      result.stats = applyResult.stats;
      result.errors = applyResult.errors;
      result.logs = applyResult.logs;
      result.success = applyResult.errors.length === 0;

      this.currentSync.status = result.success ? "success" : "error";
      this.currentSync.progress = 100;
      this.currentSync.currentStep = result.success ? "同步完成" : "同步失败";

      await this.logSync("info", `全量同步完成: ${JSON.stringify(result.stats)}`, undefined, {
        syncId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push({
        source: "manager",
        type: "unknown",
        message: errorMessage,
        timestamp: Date.now(),
      });

      this.currentSync.status = "error";
      this.currentSync.error = errorMessage;

      await this.logSync("error", `全量同步失败: ${errorMessage}`, undefined, { syncId });
    } finally {
      result.endTime = Date.now();

      // 更新每个内容源的同步状态到数据库
      try {
        const enabledSources = Array.from(this.sources.values()).filter((source) => source.enabled);

        for (const source of enabledSources) {
          // 检查该源是否有错误
          const sourceErrors = result.errors.filter((error) => error.source === source.name);
          const hasError = sourceErrors.length > 0;

          // 设置状态和错误信息
          const status = hasError ? "error" : "success";
          const errorMessage = hasError ? sourceErrors[0].message : undefined;
          const currentStep = hasError ? "同步失败" : "同步完成";

          // 更新数据库状态
          await this.updateSyncStatus(source.name, status, 100, currentStep, errorMessage);
        }

        await this.logSync(
          "info",
          `已更新 ${enabledSources.length} 个内容源的同步状态`,
          undefined,
          { syncId }
        );
      } catch (statusUpdateError) {
        // 状态更新失败不应该影响主要的同步流程
        const errorMessage =
          statusUpdateError instanceof Error
            ? statusUpdateError.message
            : String(statusUpdateError);
        await this.logSync("warn", `更新同步状态失败: ${errorMessage}`, undefined, { syncId });
      }

      this.syncHistory.push(result);

      // 限制历史记录数量
      if (this.syncHistory.length > 50) {
        this.syncHistory = this.syncHistory.slice(-25);
      }
    }

    // 完成推送会话
    syncEventManager.completeSyncSession(result.success, result.stats);

    return result;
  }

  /**
   * 获取当前同步进度
   */
  getCurrentSyncProgress(): SyncProgress | null {
    return this.currentSync;
  }

  /**
   * 取消当前同步
   */
  async cancelSync(): Promise<void> {
    if (this.currentSync && this.currentSync.status === "running") {
      this.currentSync.status = "cancelled";
      this.currentSync.currentStep = "同步已取消";
      await this.logSync("warn", "同步被用户取消");
    }
  }

  /**
   * 获取同步历史
   */
  getSyncHistory(): SyncResult[] {
    return [...this.syncHistory];
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 清空数据库中的所有内容（全量同步时使用）
   */
  private async clearAllContent(): Promise<void> {
    try {
      // 清空 posts 表中的所有内容
      await db.delete(posts);
      await this.logSync("info", "🗑️ 已清空 posts 表");

      await this.logSync("info", "✅ 数据库内容清空完成");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.logSync("error", `❌ 清空数据库失败: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * 收集所有内容源的变更
   */
  private async collectChanges(
    sources: IContentSource[],
    isFullSync: boolean = false
  ): Promise<ChangeSet[]> {
    const changeSets: ChangeSet[] = [];

    for (const [index, source] of sources.entries()) {
      try {
        if (this.currentSync) {
          this.currentSync.currentStep = `收集 ${source.name} 的变更`;
          this.currentSync.processedItems = index;
        }

        let changeSet: ChangeSet;

        if (isFullSync) {
          // 全量同步：获取所有内容，标记为创建操作
          await this.logSync(
            "info",
            `🔄 ${source.name} 执行全量扫描`,
            undefined,
            undefined,
            source.name
          );
          const allItems = await source.listContent();
          changeSet = {
            sourceName: source.name,
            changes: allItems.map((item) => ({
              item,
              operation: "create" as const,
              reason: "全量同步",
            })),
            detectedAt: Date.now(),
            stats: {
              total: allItems.length,
              created: allItems.length,
              updated: 0,
              deleted: 0,
              skipped: 0,
            },
          };
        } else {
          // 增量同步：检测变更
          const lastSyncTime = await this.getLastSyncTime(source.name);
          await this.logSync(
            "info",
            `🔍 ${source.name} 执行增量检测，上次同步: ${lastSyncTime ? new Date(lastSyncTime).toLocaleString() : "从未同步"}`,
            undefined,
            undefined,
            source.name
          );
          changeSet = await source.detectChanges(lastSyncTime);
        }

        changeSets.push(changeSet);
        await this.logSync(
          "info",
          `📊 ${source.name} 检测完成: ${changeSet.stats.total} 个变更 (新增: ${changeSet.stats.created}, 更新: ${changeSet.stats.updated})`,
          undefined,
          undefined,
          source.name
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await this.logSync(
          "error",
          `❌ 收集 ${source.name} 变更失败: ${errorMessage}`,
          undefined,
          undefined,
          source.name
        );

        // 创建空的变更集，避免中断整个同步过程
        changeSets.push({
          sourceName: source.name,
          changes: [],
          detectedAt: Date.now(),
          stats: { total: 0, created: 0, updated: 0, deleted: 0, skipped: 0 },
        });
      }
    }

    return changeSets;
  }

  /**
   * 合并多个变更集并解决冲突
   */
  private async mergeChanges(changeSets: ChangeSet[]): Promise<ChangeSet> {
    const allChanges = changeSets.flatMap((cs) => cs.changes);
    const mergedChanges = new Map<string, (typeof allChanges)[0]>();

    // 按文件路径分组
    const changesByPath = new Map<string, typeof allChanges>();
    for (const change of allChanges) {
      const path = change.item.id;
      if (!changesByPath.has(path)) {
        changesByPath.set(path, []);
      }
      changesByPath.get(path)?.push(change);
    }

    // 解决冲突
    for (const [path, pathChanges] of changesByPath) {
      if (pathChanges.length === 1) {
        // 没有冲突，直接使用
        mergedChanges.set(path, pathChanges[0]);
      } else {
        // 有冲突，根据策略解决
        const resolvedChange = await this.resolveConflict(pathChanges);
        if (resolvedChange) {
          mergedChanges.set(path, resolvedChange);
        }
      }
    }

    // 计算合并后的统计信息
    const mergedChangesList = Array.from(mergedChanges.values());
    const stats = {
      total: mergedChangesList.length,
      created: mergedChangesList.filter((c) => c.operation === "create").length,
      updated: mergedChangesList.filter((c) => c.operation === "update").length,
      deleted: mergedChangesList.filter((c) => c.operation === "delete").length,
      skipped: mergedChangesList.filter((c) => c.operation === "skip").length,
    };

    return {
      sourceName: "merged",
      changes: mergedChangesList,
      detectedAt: Date.now(),
      stats,
    };
  }

  /**
   * 解决内容冲突
   */
  private async resolveConflict(changes: ContentChange[]): Promise<ContentChange | null> {
    if (this.config.conflictResolution === "priority") {
      // 按优先级解决冲突
      const sourcesByPriority = changes
        .map((change) => ({
          change,
          source: this.sources.get(change.item.source),
        }))
        .filter((item) => item.source)
        .sort((a, b) => (b.source?.priority || 0) - (a.source?.priority || 0));

      return sourcesByPriority[0]?.change || null;
    }

    if (this.config.conflictResolution === "timestamp") {
      // 按时间戳解决冲突（最新的优先）
      return changes.sort((a, b) => b.item.lastModified - a.item.lastModified)[0];
    }

    // 默认返回第一个
    return changes[0] || null;
  }

  /**
   * 应用变更到数据库
   */
  private async applyChanges(changeSet: ChangeSet): Promise<{
    stats: SyncResult["stats"];
    errors: SyncError[];
    logs: SyncLogEntry[];
  }> {
    const stats = { totalProcessed: 0, created: 0, updated: 0, deleted: 0, skipped: 0, errors: 0 };
    const errors: SyncError[] = [];
    const logs: SyncLogEntry[] = [];
    const totalChanges = changeSet.changes.length;

    await this.logSync("info", `📝 开始应用变更，共 ${totalChanges} 个项目`);

    for (const [index, change] of changeSet.changes.entries()) {
      try {
        stats.totalProcessed++;

        // 更新进度
        if (this.currentSync) {
          this.currentSync.progress = Math.round((index / totalChanges) * 100);
          this.currentSync.currentStep = `处理 ${change.item.title || change.item.slug} (${index + 1}/${totalChanges})`;
        }

        if (change.operation === "create" || change.operation === "update") {
          // 插入或更新内容
          await db
            .insert(posts)
            .values({
              id: change.item.id,
              slug: change.item.slug,
              type: change.item.type,
              title: change.item.title,
              excerpt: change.item.excerpt || "",
              body: (change.item.metadata.content as string) || "",
              publishDate: change.item.publishDate,
              updateDate: change.item.updateDate,
              draft: change.item.draft,
              public: change.item.public,
              category: change.item.category,
              tags: JSON.stringify(change.item.tags),
              author: change.item.author,
              image: change.item.image,
              metadata: JSON.stringify(change.item.metadata),
              dataSource: change.item.source,
              contentHash: change.item.contentHash,
              lastModified: change.item.lastModified,
              source: change.item.source,
              filePath: change.item.id, // 使用 id 作为文件路径
            })
            .onConflictDoUpdate({
              target: posts.id,
              set: {
                slug: change.item.slug,
                type: change.item.type,
                title: change.item.title,
                excerpt: change.item.excerpt || "",
                body: (change.item.metadata.content as string) || "",
                publishDate: change.item.publishDate,
                updateDate: change.item.updateDate || Date.now(),
                draft: change.item.draft,
                public: change.item.public,
                category: change.item.category,
                tags: JSON.stringify(change.item.tags),
                author: change.item.author,
                image: change.item.image,
                metadata: JSON.stringify(change.item.metadata),
                dataSource: change.item.source,
                contentHash: change.item.contentHash,
                lastModified: change.item.lastModified,
                source: change.item.source,
                filePath: change.item.id, // 使用 id 作为文件路径
              },
            });

          if (change.operation === "create") {
            stats.created++;
            // 记录创建成功的日志
            await this.logSync(
              "info",
              `✅ 创建内容: ${change.item.title}`,
              change.item.id,
              {
                operation: "create",
                source: change.item.source,
                type: change.item.type,
                slug: change.item.slug,
              },
              change.item.source
            );
          } else {
            stats.updated++;
            // 记录更新成功的日志
            await this.logSync(
              "info",
              `🔄 更新内容: ${change.item.title}`,
              change.item.id,
              {
                operation: "update",
                source: change.item.source,
                type: change.item.type,
                slug: change.item.slug,
              },
              change.item.source
            );
          }
        } else if (change.operation === "delete") {
          await db.delete(posts).where(eq(posts.id, change.item.id));
          stats.deleted++;
          // 记录删除成功的日志
          await this.logSync(
            "info",
            `🗑️ 删除内容: ${change.item.title}`,
            change.item.id,
            {
              operation: "delete",
              source: change.item.source,
              type: change.item.type,
              slug: change.item.slug,
            },
            change.item.source
          );
        } else {
          stats.skipped++;
          // 记录跳过的日志
          await this.logSync(
            "info",
            `⏭️ 跳过内容: ${change.item.title}`,
            change.item.id,
            {
              operation: "skip",
              source: change.item.source,
              type: change.item.type,
              slug: change.item.slug,
              reason: change.reason,
            },
            change.item.source
          );
        }
      } catch (error) {
        stats.errors++;
        const errorMessage = error instanceof Error ? error.message : String(error);

        errors.push({
          source: change.item.source,
          type: "database",
          message: errorMessage,
          filePath: change.item.id,
          timestamp: Date.now(),
        });

        // 记录详细的错误日志
        await this.logSync(
          "error",
          `❌ ${change.operation} 失败: ${change.item.title} - ${errorMessage}`,
          change.item.id,
          {
            operation: change.operation,
            source: change.item.source,
            type: change.item.type,
            slug: change.item.slug,
            error: errorMessage,
          },
          change.item.source
        );

        logs.push({
          level: "error",
          message: `应用变更失败: ${change.item.id}`,
          source: change.item.source,
          filePath: change.item.id,
          data: { error: errorMessage },
          timestamp: Date.now(),
        });
      }
    }

    return { stats, errors, logs };
  }

  /**
   * 获取上次同步时间
   */
  private async getLastSyncTime(sourceName: string): Promise<number | undefined> {
    try {
      const result = await db
        .select({ lastSyncAt: contentSyncStatus.lastSyncAt })
        .from(contentSyncStatus)
        .where(eq(contentSyncStatus.sourceName, sourceName))
        .limit(1);

      return result[0]?.lastSyncAt || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * 记录同步日志
   */
  private async logSync(
    level: "info" | "warn" | "error",
    message: string,
    filePath?: string,
    data?: Record<string, unknown>,
    sourceName?: string
  ): Promise<void> {
    try {
      // 如果提供了 sourceName，尝试获取对应的内容源信息
      let sourceType = "manager";
      let actualSourceName = "ContentSourceManager";

      if (sourceName && this.sources.has(sourceName)) {
        const source = this.sources.get(sourceName);
        if (source) {
          sourceType = source.type;
          actualSourceName = source.name;
        }
      }

      // 映射日志级别到数据库状态
      const getStatusFromLevel = (level: string): "success" | "error" | "warning" => {
        switch (level) {
          case "error":
            return "error";
          case "warn":
          case "warning":
            return "warning";
          default:
            return "success";
        }
      };

      const logEntry = {
        id: nanoid(),
        sourceType,
        sourceName: actualSourceName,
        operation: "sync",
        status: getStatusFromLevel(level),
        message,
        filePath,
        data: data ? JSON.stringify(data) : null,
        createdAt: Date.now(),
      };

      // 保存到数据库
      await db.insert(contentSyncLogs).values(logEntry);

      // 推送日志（只在有活跃同步会话时推送）
      if (syncEventManager.getCurrentSyncSessionId()) {
        syncEventManager.pushLog({
          id: logEntry.id,
          sourceType: logEntry.sourceType,
          sourceName: logEntry.sourceName,
          operation: logEntry.operation,
          status: logEntry.status as "success" | "error",
          message: logEntry.message,
          filePath: logEntry.filePath || undefined,
          data: logEntry.data ? JSON.parse(logEntry.data) : undefined,
          createdAt: logEntry.createdAt,
        });
      }
    } catch (error) {
      console.error("记录同步日志失败:", error);

      // 如果是表不存在的错误，尝试创建表
      if (error instanceof Error && error.message.includes("no such table: content_sync_logs")) {
        console.log("🔧 检测到 content_sync_logs 表不存在，尝试创建...");
        try {
          await this.ensureLogTableExists();

          // 等待一小段时间确保表创建完成
          await new Promise((resolve) => setTimeout(resolve, 100));

          // 重试记录日志
          await db.insert(contentSyncLogs).values({
            id: nanoid(),
            sourceType: "manager",
            sourceName: "ContentSourceManager",
            operation: "sync",
            status: level === "error" ? "error" : "success",
            message,
            filePath,
            data: data ? JSON.stringify(data) : null,
            createdAt: Date.now(),
          });
          console.log("✅ 成功创建表并记录日志");
        } catch (retryError) {
          console.error("❌ 创建表并重试记录日志失败:", retryError);
          // 即使日志记录失败，也不应该阻止内容同步继续进行
          console.warn("⚠️  日志记录失败，但内容同步将继续进行");
        }
      } else {
        // 对于其他类型的错误，也不应该阻止内容同步
        console.warn("⚠️  日志记录失败，但内容同步将继续进行:", error);
      }
    }
  }

  /**
   * 确保日志表存在
   */
  private async ensureLogTableExists(): Promise<void> {
    try {
      console.log("🔧 开始创建缺失的日志表...");

      // 使用原始SQL创建表
      await db.run(sql`
        CREATE TABLE IF NOT EXISTS content_sync_logs (
          id text PRIMARY KEY NOT NULL,
          source_type text NOT NULL,
          source_name text NOT NULL,
          operation text NOT NULL,
          status text NOT NULL,
          message text NOT NULL,
          file_path text,
          data text,
          created_at integer NOT NULL
        )
      `);
      console.log("✅ content_sync_logs 表创建完成");

      await db.run(sql`
        CREATE TABLE IF NOT EXISTS content_sync_status (
          source_type text PRIMARY KEY NOT NULL,
          source_name text NOT NULL,
          last_sync_at integer,
          status text DEFAULT 'idle' NOT NULL,
          progress integer DEFAULT 0 NOT NULL,
          current_step text,
          total_items integer DEFAULT 0 NOT NULL,
          processed_items integer DEFAULT 0 NOT NULL,
          error_message text,
          metadata text,
          updated_at integer NOT NULL
        )
      `);
      console.log("✅ content_sync_status 表创建完成");

      // 验证表是否真的创建成功
      await db.run(sql`
        SELECT name FROM sqlite_master WHERE type='table' AND name IN ('content_sync_logs', 'content_sync_status')
      `);
      console.log("✅ 日志表创建验证完成");
    } catch (error) {
      console.error("❌ 创建日志表失败:", error);
      throw error;
    }
  }

  // ============================================================================
  // 状态管理
  // ============================================================================

  /**
   * 更新内容源同步状态
   */
  private async updateSyncStatus(
    sourceName: string,
    status: SyncStatus,
    progress: number = 0,
    currentStep?: string,
    errorMessage?: string
  ): Promise<void> {
    try {
      await db
        .insert(contentSyncStatus)
        .values({
          sourceType: this.getSource(sourceName)?.type || "unknown",
          sourceName,
          lastSyncAt: status === "success" ? Date.now() : undefined,
          status,
          progress,
          currentStep,
          totalItems: this.currentSync?.totalItems || 0,
          processedItems: this.currentSync?.processedItems || 0,
          errorMessage,
          metadata: JSON.stringify({
            syncId: nanoid(),
            timestamp: Date.now(),
          }),
          updatedAt: Date.now(),
        })
        .onConflictDoUpdate({
          target: contentSyncStatus.sourceType,
          set: {
            sourceName,
            lastSyncAt: status === "success" ? Date.now() : undefined,
            status,
            progress,
            currentStep,
            totalItems: this.currentSync?.totalItems || 0,
            processedItems: this.currentSync?.processedItems || 0,
            errorMessage,
            metadata: JSON.stringify({
              syncId: nanoid(),
              timestamp: Date.now(),
            }),
            updatedAt: Date.now(),
          },
        });
    } catch (error) {
      console.error("更新同步状态失败:", error);
    }
  }

  /**
   * 获取所有内容源的状态
   */
  async getAllSourcesStatus(): Promise<
    Array<{
      source: IContentSource;
      status: ContentSourceStatus;
      lastSync?: number;
    }>
  > {
    const results = [];

    for (const source of this.sources.values()) {
      try {
        const sourceStatus = await source.getStatus();

        // 从数据库获取同步状态
        const syncStatus = await db
          .select()
          .from(contentSyncStatus)
          .where(eq(contentSyncStatus.sourceName, source.name))
          .limit(1);

        results.push({
          source,
          status: sourceStatus,
          lastSync: syncStatus[0]?.lastSyncAt || undefined,
        });
      } catch (error) {
        results.push({
          source,
          status: {
            name: source.name,
            online: false,
            totalItems: 0,
            error: error instanceof Error ? error.message : String(error),
            metadata: {},
          } as ContentSourceStatus,
        });
      }
    }

    return results;
  }

  /**
   * 获取同步日志
   */
  async getSyncLogs(limit: number = 100): Promise<ContentSyncLog[]> {
    try {
      // 按创建时间降序排列，最新的日志在前面
      return await db
        .select()
        .from(contentSyncLogs)
        .orderBy(desc(contentSyncLogs.createdAt))
        .limit(limit);
    } catch (error) {
      console.error("获取同步日志失败:", error);
      return [];
    }
  }

  /**
   * 清理旧的同步日志
   */
  async cleanupOldLogs(daysToKeep: number = 30): Promise<void> {
    try {
      const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
      await db.delete(contentSyncLogs).where(lt(contentSyncLogs.createdAt, cutoffTime));

      await this.logSync("info", `清理了 ${daysToKeep} 天前的同步日志`);
    } catch (error) {
      await this.logSync(
        "error",
        `清理同步日志失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // ============================================================================
  // 工具方法
  // ============================================================================

  /**
   * 验证所有内容源的连接
   */
  async validateAllConnections(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const source of this.sources.values()) {
      try {
        const isConnected = await source.validateConnection();
        results.set(source.name, isConnected);
      } catch (_error) {
        results.set(source.name, false);
      }
    }

    return results;
  }

  /**
   * 获取管理器统计信息
   */
  getManagerStats(): {
    registeredSources: number;
    enabledSources: number;
    currentSyncStatus: SyncStatus | null;
    lastSyncTime?: number;
    totalSyncs: number;
  } {
    const enabledSources = Array.from(this.sources.values()).filter((s) => s.enabled);
    const lastSync = this.syncHistory[this.syncHistory.length - 1];

    return {
      registeredSources: this.sources.size,
      enabledSources: enabledSources.length,
      currentSyncStatus: this.currentSync?.status || null,
      lastSyncTime: lastSync?.endTime,
      totalSyncs: this.syncHistory.length,
    };
  }

  /**
   * 清理资源
   */
  async dispose(): Promise<void> {
    // 取消当前同步
    await this.cancelSync();

    // 清理所有内容源
    for (const source of this.sources.values()) {
      try {
        await source.dispose();
      } catch (error) {
        console.error(`清理内容源 ${source.name} 失败:`, error);
      }
    }

    this.sources.clear();
    this.syncHistory = [];
    this.currentSync = null;

    await this.logSync("info", "内容源管理器已清理");
  }
}

// ============================================================================
// 工厂函数和工具
// ============================================================================

/**
 * 创建默认的内容源管理器
 */
export function createContentSourceManager(
  config?: ContentSourceManagerConfig
): ContentSourceManager {
  return new ContentSourceManager(config);
}

/**
 * 内容源管理器单例
 */
let globalManager: ContentSourceManager | null = null;

/**
 * 获取全局内容源管理器实例
 */
export function getContentSourceManager(config?: ContentSourceManagerConfig): ContentSourceManager {
  if (!globalManager) {
    globalManager = new ContentSourceManager(config);
  }
  return globalManager;
}

/**
 * 重置全局内容源管理器
 */
export async function resetContentSourceManager(): Promise<void> {
  if (globalManager) {
    await globalManager.dispose();
    globalManager = null;
  }
}
