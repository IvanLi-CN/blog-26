/**
 * 同步事件管理器
 * 用于实时推送同步日志，不使用轮询
 */

import { EventEmitter } from "node:events";

export interface SyncLogEvent {
  id: string;
  sourceType: string;
  sourceName: string;
  operation: string;
  status: "success" | "error" | "warning"; // 新增 warning 用于重试/限流等非致命事件
  message: string;
  filePath?: string;
  data?: any;
  createdAt: number;
  syncSessionId: string; // 同步会话ID
}

export interface SyncStartEvent {
  syncSessionId: string;
  syncType: "full" | "incremental";
  timestamp: number;
}

export interface SyncCompleteEvent {
  syncSessionId: string;
  success: boolean;
  stats: any;
  timestamp: number;
}

class SyncEventManager extends EventEmitter {
  private currentSyncSessionId: string | null = null;
  private _instanceId: string;

  constructor() {
    super();
    this._instanceId = Math.random().toString(36).substring(2, 11);
    console.log("🎯 创建 SyncEventManager 实例:", this._instanceId);
  }

  /**
   * 开始新的同步会话
   */
  startSyncSession(syncType: "full" | "incremental"): string {
    const syncSessionId = `sync_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    this.currentSyncSessionId = syncSessionId;

    console.log(`🚀 开始同步会话: ${syncSessionId} (类型: ${syncType})`);

    this.emit("sync:start", {
      syncSessionId,
      syncType,
      timestamp: Date.now(),
    } as SyncStartEvent);

    return syncSessionId;
  }

  /**
   * 推送同步日志
   */
  pushLog(log: Omit<SyncLogEvent, "syncSessionId">) {
    if (!this.currentSyncSessionId) {
      console.warn("尝试推送日志但没有活跃的同步会话");
      return;
    }

    const logWithSession: SyncLogEvent = {
      ...log,
      syncSessionId: this.currentSyncSessionId,
    };

    console.log(
      `📝 sync:log status=${log.status} op=${log.operation} src=${log.sourceName} msg="${log.message}" path=${
        log.filePath || ""
      } session=${this.currentSyncSessionId}`
    );
    this.emit("sync:log", logWithSession);
  }

  /**
   * 完成同步会话
   */
  completeSyncSession(success: boolean, stats: any) {
    if (!this.currentSyncSessionId) {
      console.warn("尝试完成同步会话但没有活跃的同步会话");
      return;
    }

    const sid = this.currentSyncSessionId;
    const s: any = stats || {};
    console.log(
      `✅ sync:complete session=${sid} success=${success} processed=${
        s.totalProcessed ?? s.processed ?? ""
      } created=${s.created ?? ""} updated=${s.updated ?? ""} deleted=${s.deleted ?? ""} skipped=${
        s.skipped ?? ""
      } errors=${s.errors ?? ""} model=${s.model ?? ""} ts=${Date.now()}`
    );

    this.emit("sync:complete", {
      syncSessionId: this.currentSyncSessionId,
      success,
      stats,
      timestamp: Date.now(),
    } as SyncCompleteEvent);

    this.currentSyncSessionId = null;
  }

  /**
   * 获取当前同步会话ID
   */
  getCurrentSyncSessionId(): string | null {
    return this.currentSyncSessionId;
  }

  /**
   * 监听同步开始事件
   */
  onSyncStart(listener: (event: SyncStartEvent) => void) {
    this.on("sync:start", listener);
  }

  /**
   * 监听同步日志事件
   */
  onSyncLog(listener: (event: SyncLogEvent) => void) {
    console.log(
      `🎯 注册 sync:log 监听器 emitter=${this.constructor.name} count=${this.listenerCount(
        "sync:log"
      )}`
    );
    this.on("sync:log", listener);
    console.log(`✅ sync:log 监听器注册完成 count=${this.listenerCount("sync:log")}`);
  }

  /**
   * 监听同步完成事件
   */
  onSyncComplete(listener: (event: SyncCompleteEvent) => void) {
    this.on("sync:complete", listener);
  }

  /**
   * 移除监听器
   */
  offSyncStart(listener: (event: SyncStartEvent) => void) {
    this.off("sync:start", listener);
  }

  offSyncLog(listener: (event: SyncLogEvent) => void) {
    this.off("sync:log", listener);
  }

  offSyncComplete(listener: (event: SyncCompleteEvent) => void) {
    this.off("sync:complete", listener);
  }
}

// 全局单例 - 使用多重保护确保在开发环境中不会被重新创建
const globalForSyncEventManager = globalThis as unknown as {
  __syncEventManager: SyncEventManager | undefined;
  __syncEventManagerCreated: boolean | undefined;
};

// 强制单例模式 - 即使在模块重新加载时也保持同一个实例
if (!globalForSyncEventManager.__syncEventManagerCreated) {
  globalForSyncEventManager.__syncEventManager = new SyncEventManager();
  globalForSyncEventManager.__syncEventManagerCreated = true;
  console.log(
    "🎯 创建全局唯一 SyncEventManager 实例:",
    (globalForSyncEventManager.__syncEventManager as any)._instanceId
  );
} else {
  console.log(
    "🔄 复用现有 SyncEventManager 实例:",
    (globalForSyncEventManager.__syncEventManager as any)._instanceId
  );
}

export const syncEventManager = globalForSyncEventManager.__syncEventManager as SyncEventManager;
