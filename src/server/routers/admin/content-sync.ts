/**
 * 内容同步管理 tRPC 路由
 *
 * 提供内容源管理和同步控制的 API 接口
 */

import { EventEmitter, on } from "node:events";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SYSTEM_CONFIG } from "../../../config/paths";
import {
  getContentSourceManager,
  LocalContentSource,
  WebDAVContentSource,
} from "../../../lib/content-sources";
import { syncEventManager } from "../../../lib/sync-events";
import { isWebDAVEnabled } from "../../../lib/webdav";
import { adminProcedure, createTRPCRouter, publicProcedure } from "../../trpc";

// 输入验证 Schema
const syncConfigSchema = z.object({
  maxConcurrentSyncs: z.number().min(1).max(10).optional(),
  syncTimeout: z.number().min(10000).max(600000).optional(), // 10秒到10分钟
  enableTransactions: z.boolean().optional(),
  conflictResolution: z.enum(["priority", "timestamp", "manual"]).optional(),
  isFullSync: z.boolean().optional(), // 是否为全量同步
});

const _contentSourceConfigSchema = z.object({
  name: z.string().min(1),
  priority: z.number().min(0).max(1000),
  enabled: z.boolean(),
  type: z.enum(["local", "webdav"]),
  options: z.record(z.unknown()),
});

/**
 * 内容同步管理路由
 */
export const adminContentSyncRouter = createTRPCRouter({
  // ============================================================================
  // 同步操作
  // ============================================================================

  /**
   * 触发同步操作
   */
  triggerSync: adminProcedure.input(syncConfigSchema.optional()).mutation(async ({ input }) => {
    try {
      const { isFullSync = false, ...managerConfig } = input || {};
      const manager = getContentSourceManager(managerConfig);

      // 检查是否有正在进行的同步
      const currentSync = manager.getCurrentSyncProgress();
      if (currentSync && currentSync.status === "running") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "同步正在进行中，请等待完成",
        });
      }

      // 确保有注册的内容源
      await ensureContentSourcesRegistered(manager);

      // 执行同步（传入同步类型）
      const result = await manager.syncAll(isFullSync);

      return {
        success: result.success,
        syncId: `sync_${Date.now()}`,
        startTime: result.startTime,
        endTime: result.endTime,
        stats: result.stats,
        sources: result.sources,
        errors: result.errors.map((error) => ({
          source: error.source,
          type: error.type,
          message: error.message,
          filePath: error.filePath,
        })),
      };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "同步失败",
      });
    }
  }),

  /**
   * 取消当前同步
   */
  cancelSync: adminProcedure.mutation(async () => {
    try {
      const manager = getContentSourceManager();
      await manager.cancelSync();

      return { success: true, message: "同步已取消" };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "取消同步失败",
      });
    }
  }),

  // ============================================================================
  // 状态查询
  // ============================================================================

  /**
   * 获取内容统计信息
   */
  getContentStats: adminProcedure.query(async () => {
    try {
      const { db } = await import("../../../lib/db");
      const { posts } = await import("../../../lib/schema");
      const { sql } = await import("drizzle-orm");

      // 查询 posts 表统计
      const postsStats = await db
        .select({
          type: posts.type,
          source: posts.source,
          count: sql<number>`count(*)`.as("count"),
        })
        .from(posts)
        .groupBy(posts.type, posts.source);

      // 使用 posts 表的统计结果
      const allStats = postsStats;

      // 获取所有已知的内容源和类型
      const knownSources = ["local", "webdav"]; // 已知的内容源
      const knownTypes = ["memo", "post", "project"]; // 已知的内容类型

      // 按类型分组，确保所有内容源都显示
      const statsByType: Record<string, { total: number; sources: Record<string, number> }> = {};

      // 初始化所有类型和内容源的组合
      for (const type of knownTypes) {
        statsByType[type] = { total: 0, sources: {} };
        for (const source of knownSources) {
          statsByType[type].sources[source] = 0;
        }
      }

      // 填入实际的统计数据
      for (const stat of allStats) {
        const type = stat.type || "unknown";
        const source = stat.source || "unknown";
        const count = Number(stat.count) || 0;

        if (!statsByType[type]) {
          statsByType[type] = { total: 0, sources: {} };
        }

        statsByType[type].total += count;
        statsByType[type].sources[source] = (statsByType[type].sources[source] || 0) + count;
      }

      // 计算总计
      const totalCount = Object.values(statsByType).reduce((sum, stat) => sum + stat.total, 0);

      return {
        total: totalCount,
        byType: statsByType,
        lastUpdated: Date.now(),
      };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "获取统计信息失败",
      });
    }
  }),

  /**
   * 获取当前同步进度
   */
  getSyncProgress: adminProcedure.query(async () => {
    try {
      const manager = getContentSourceManager();
      const progress = manager.getCurrentSyncProgress();

      return progress
        ? {
            status: progress.status,
            progress: progress.progress,
            currentStep: progress.currentStep,
            processedItems: progress.processedItems,
            totalItems: progress.totalItems,
            startTime: progress.startTime,
            estimatedTimeRemaining: progress.estimatedTimeRemaining,
            error: progress.error,
          }
        : null;
    } catch (error) {
      console.error("Failed to fetch sync progress:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "获取同步进度失败",
      });
    }
  }),

  /**
   * 获取所有内容源状态
   */
  getSourcesStatus: adminProcedure.query(async () => {
    try {
      const manager = getContentSourceManager();
      await ensureContentSourcesRegistered(manager);

      const sourcesStatus = await manager.getAllSourcesStatus();

      // 数据量从数据库 posts 表统计，而非扫描源目录
      const { db } = await import("../../../lib/db");
      const { posts } = await import("../../../lib/schema");
      const { sql } = await import("drizzle-orm");

      const dbCounts = await db
        .select({ source: posts.source, count: sql<number>`count(*)`.as("count") })
        .from(posts)
        .groupBy(posts.source);

      const countMap = new Map<string, number>();
      for (const row of dbCounts) {
        countMap.set(row.source || "unknown", Number(row.count) || 0);
      }

      return sourcesStatus.map(({ source, status, lastSync }) => ({
        name: source.name,
        type: source.type,
        priority: source.priority,
        enabled: source.enabled,
        online: status.online, // 仅做可用性判断
        totalItems: countMap.get(source.name) || 0, // 数据量来源于 DB（同步结果）
        lastSync,
        error: status.error,
        metadata: status.metadata,
      }));
    } catch (error) {
      console.error("Failed to fetch content source status:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "获取内容源状态失败",
      });
    }
  }),

  /**
   * 获取管理器统计信息
   */
  getManagerStats: adminProcedure.query(async () => {
    try {
      const manager = getContentSourceManager();
      // Ensure default sources are registered so first-time stats reflect reality
      await ensureContentSourcesRegistered(manager);
      const stats = manager.getManagerStats();

      return {
        registeredSources: stats.registeredSources,
        enabledSources: stats.enabledSources,
        currentSyncStatus: stats.currentSyncStatus,
        lastSyncTime: stats.lastSyncTime,
        totalSyncs: stats.totalSyncs,
      };
    } catch (error) {
      console.error("Failed to get manager stats:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "获取管理器统计信息失败",
      });
    }
  }),

  // ============================================================================
  // 日志管理
  // ============================================================================

  /**
   * 获取同步日志
   */
  getSyncLogs: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(1000).default(100),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      try {
        const manager = getContentSourceManager();
        const logs = await manager.getSyncLogs(input.limit);

        return logs.slice(input.offset).map((log) => ({
          id: log.id,
          sourceType: log.sourceType,
          sourceName: log.sourceName,
          operation: log.operation,
          status: log.status,
          message: log.message,
          filePath: log.filePath,
          data: log.data ? JSON.parse(log.data) : null,
          createdAt: log.createdAt,
        }));
      } catch (error) {
        console.error("Failed to fetch sync logs:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "获取同步日志失败",
        });
      }
    }),

  // ============================================================================
  // 内容源管理
  // ============================================================================

  /**
   * 验证所有内容源连接
   */
  validateConnections: adminProcedure.query(async () => {
    try {
      const manager = getContentSourceManager();
      await ensureContentSourcesRegistered(manager);

      const results = await manager.validateAllConnections();

      return Array.from(results.entries()).map(([sourceName, isConnected]) => ({
        sourceName,
        isConnected,
      }));
    } catch (error) {
      console.error("Failed to validate connections:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "验证连接失败",
      });
    }
  }),

  /**
   * 获取同步历史
   */
  getSyncHistory: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input }) => {
      try {
        const manager = getContentSourceManager();
        const history = manager.getSyncHistory();

        return history.slice(-input.limit).map((result) => ({
          success: result.success,
          startTime: result.startTime,
          endTime: result.endTime,
          duration: result.endTime - result.startTime,
          sources: result.sources,
          stats: result.stats,
          errorCount: result.errors.length,
        }));
      } catch (error) {
        console.error("Failed to fetch sync history:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "获取同步历史失败",
        });
      }
    }),

  /**
   * 获取系统配置信息
   */
  getSystemConfig: adminProcedure.query(async () => {
    return {
      webdavEnabled: SYSTEM_CONFIG.webdav.enabled,
      webdavUrl: SYSTEM_CONFIG.webdav.url,
      supportedSources: SYSTEM_CONFIG.supportedSources,
      defaultPaths: {
        local: SYSTEM_CONFIG.local.basePath,
        webdav: SYSTEM_CONFIG.webdav.pathMappings,
      },
    };
  }),

  // ============================================================================
  // 订阅功能
  // ============================================================================

  /**
   * 订阅同步日志推送 (SSE)
   */
  subscribeSyncLogs: publicProcedure.subscription(async function* (opts) {
    console.log(
      `🔗 SSE 连接建立 instance=${syncEventManager.constructor.name} id=${
        (syncEventManager as any)._instanceId || "undefined"
      } currentSession=${syncEventManager.getCurrentSyncSessionId()}`
    );

    // 发送连接确认
    console.log("📡 SSE 已发送连接确认");
    yield {
      type: "connected",
      data: {
        message: "已连接到同步日志推送服务 (SSE)",
        timestamp: Date.now(),
      },
    };
    console.log("✅ SSE 连接确认已发送");

    // 创建一个 EventEmitter 来聚合所有事件
    const eventAggregator = new EventEmitter();

    // 监听同步开始事件
    const onSyncStart = (event: any) => {
      console.log(
        `📡 SSE 同步开始 session=${event?.syncSessionId} type=${event?.syncType} ts=${event?.timestamp}`
      );
      eventAggregator.emit("sync-event", {
        type: "sync:start",
        data: event,
      });
    };

    // 监听同步日志事件
    const onSyncLog = (event: any) => {
      eventAggregator.emit("sync-event", {
        type: "sync:log",
        data: event,
      });
    };

    // 监听同步完成事件
    const onSyncComplete = (event: any) => {
      const e = event || {};
      const stats = (e.stats as any) || {};
      console.log(
        `📡 SSE 同步完成 session=${e.syncSessionId} success=${e.success} total=${
          stats.total ?? ""
        } processed=${stats.processed ?? ""} ok=${stats.success ?? ""} failed=${
          stats.failed ?? ""
        } model=${stats.model ?? ""} ts=${e.timestamp}`
      );
      eventAggregator.emit("sync-event", {
        type: "sync:complete",
        data: event,
      });
    };

    // 注册事件监听器
    syncEventManager.onSyncStart(onSyncStart);
    syncEventManager.onSyncLog(onSyncLog);
    syncEventManager.onSyncComplete(onSyncComplete);
    console.log("✅ SSE 事件监听器已注册");

    try {
      // 监听聚合的事件
      for await (const [eventData] of on(eventAggregator, "sync-event", {
        signal: opts.signal,
      })) {
        yield eventData;
      }
    } finally {
      // 清理事件监听器
      console.log("🧹 清理 SSE 事件监听器");
      syncEventManager.offSyncStart(onSyncStart);
      syncEventManager.offSyncLog(onSyncLog);
      syncEventManager.offSyncComplete(onSyncComplete);
    }
  }),
});

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 确保内容源已注册
 */
async function ensureContentSourcesRegistered(manager: ReturnType<typeof getContentSourceManager>) {
  const sources = manager.getSources();

  // 如果没有注册的内容源，自动注册默认的内容源
  if (sources.length === 0) {
    // 仅当存在 LOCAL_CONTENT_BASE_PATH 且非空时注册本地源
    const basePathEnv = process.env.LOCAL_CONTENT_BASE_PATH;
    const configuredBasePath =
      typeof basePathEnv === "string" && basePathEnv.trim().length > 0
        ? basePathEnv.trim()
        : SYSTEM_CONFIG.local.basePath;
    const localEnabled = typeof configuredBasePath === "string" && configuredBasePath.length > 0;

    if (localEnabled) {
      const localConfig = LocalContentSource.createDefaultConfig("local", 50, {
        contentPath: configuredBasePath,
      });
      const localSource = new LocalContentSource(localConfig);
      await manager.registerSource(localSource);
    }

    // 如果 WebDAV 可用，注册 WebDAV 内容源
    if (isWebDAVEnabled()) {
      try {
        const webdavConfig = WebDAVContentSource.createDefaultConfig("webdav", 100);
        const webdavSource = new WebDAVContentSource(webdavConfig);
        await manager.registerSource(webdavSource);
      } catch (error) {
        console.warn("WebDAV 内容源注册失败:", error);
      }
    }
  }
}
