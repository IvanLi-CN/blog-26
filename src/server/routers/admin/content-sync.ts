/**
 * 内容同步管理 tRPC 路由
 *
 * 提供内容源管理和同步控制的 API 接口
 */

import { resolve } from "node:path";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SYSTEM_CONFIG } from "../../../config/paths";
import {
  getContentSourceManager,
  LocalContentSource,
  WebDAVContentSource,
} from "../../../lib/content-sources";
import { isWebDAVEnabled } from "../../../lib/webdav";
import { adminProcedure, createTRPCRouter } from "../../trpc";

// 输入验证 Schema
const syncConfigSchema = z.object({
  maxConcurrentSyncs: z.number().min(1).max(10).optional(),
  syncTimeout: z.number().min(10000).max(600000).optional(), // 10秒到10分钟
  enableTransactions: z.boolean().optional(),
  conflictResolution: z.enum(["priority", "timestamp", "manual"]).optional(),
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
   * 触发全量同步
   */
  triggerSync: adminProcedure.input(syncConfigSchema.optional()).mutation(async ({ input }) => {
    try {
      const manager = getContentSourceManager(input);

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

      // 执行同步
      const result = await manager.syncAll();

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
    } catch (_error) {
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

      return sourcesStatus.map(({ source, status, lastSync }) => ({
        name: source.name,
        type: source.type,
        priority: source.priority,
        enabled: source.enabled,
        online: status.online,
        totalItems: status.totalItems,
        lastSync,
        error: status.error,
        metadata: status.metadata,
      }));
    } catch (_error) {
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
      const stats = manager.getManagerStats();

      return {
        registeredSources: stats.registeredSources,
        enabledSources: stats.enabledSources,
        currentSyncStatus: stats.currentSyncStatus,
        lastSyncTime: stats.lastSyncTime,
        totalSyncs: stats.totalSyncs,
      };
    } catch (_error) {
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
      } catch (_error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "获取同步日志失败",
        });
      }
    }),

  /**
   * 清理旧日志
   */
  cleanupLogs: adminProcedure
    .input(
      z.object({
        daysToKeep: z.number().min(1).max(365).default(30),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const manager = getContentSourceManager();
        await manager.cleanupOldLogs(input.daysToKeep);

        return { success: true, message: `已清理 ${input.daysToKeep} 天前的日志` };
      } catch (_error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "清理日志失败",
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
    } catch (_error) {
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
      } catch (_error) {
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
    // 注册本地内容源 - 使用系统配置中的正确路径
    const localConfig = LocalContentSource.createDefaultConfig("local", 50, {
      contentPath: SYSTEM_CONFIG.local.basePath,
    });
    const localSource = new LocalContentSource(localConfig);
    await manager.registerSource(localSource);

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
