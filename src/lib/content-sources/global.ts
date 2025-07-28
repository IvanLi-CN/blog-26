/**
 * 多源内容数据源架构 - 全局管理器实例
 *
 * 提供全局的多源内容管理器实例，用于整个应用程序
 */

import type { MultiSourceContentManager } from './manager';
import { initializeMultiSourceManager } from './registry';

// 全局管理器实例
let _globalManager: MultiSourceContentManager | null = null;
let _initializationPromise: Promise<MultiSourceContentManager> | null = null;

/**
 * 获取全局多源内容管理器实例
 * 如果尚未初始化，将自动初始化
 */
export async function getGlobalContentManager(): Promise<MultiSourceContentManager> {
  if (_globalManager) {
    return _globalManager;
  }

  // 如果正在初始化，等待初始化完成
  if (_initializationPromise) {
    return _initializationPromise;
  }

  // 开始初始化
  _initializationPromise = initializeMultiSourceManager();

  try {
    _globalManager = await _initializationPromise;
    console.log('🎉 全局多源内容管理器初始化完成');
    return _globalManager;
  } catch (error) {
    // 重置状态以允许重试
    _initializationPromise = null;
    console.error('❌ 全局多源内容管理器初始化失败:', error);
    throw error;
  }
}

/**
 * 重置全局管理器实例（主要用于测试）
 */
export async function resetGlobalContentManager(): Promise<void> {
  if (_globalManager) {
    await _globalManager.dispose();
    _globalManager = null;
  }
  _initializationPromise = null;
  console.log('🧹 全局多源内容管理器已重置');
}

/**
 * 检查全局管理器是否已初始化
 */
export function isGlobalContentManagerInitialized(): boolean {
  return _globalManager !== null;
}

/**
 * 获取全局管理器的状态信息
 */
export async function getGlobalContentManagerInfo(): Promise<any> {
  if (!_globalManager) {
    return {
      initialized: false,
      error: 'Manager not initialized',
    };
  }

  try {
    const info = _globalManager.getManagerInfo();
    return {
      initialized: true,
      ...info,
    };
  } catch (error) {
    return {
      initialized: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 便捷的内容操作函数
 * 这些函数会自动获取全局管理器实例并调用相应的方法
 */

export async function getContent(id: string) {
  const manager = await getGlobalContentManager();
  return manager.getContent(id);
}

export async function getContentBySlug(slug: string, type?: any) {
  const manager = await getGlobalContentManager();
  return manager.getContentBySlug(slug, type);
}

export async function listContent(options?: any) {
  const manager = await getGlobalContentManager();
  return manager.listContent(options);
}

export async function getContentIndex() {
  const manager = await getGlobalContentManager();
  return manager.getContentIndex();
}

export async function createContent(input: any, targetSource?: string) {
  const manager = await getGlobalContentManager();
  return manager.createContent(input, targetSource);
}

export async function updateContent(id: string, input: any) {
  const manager = await getGlobalContentManager();
  return manager.updateContent(id, input);
}

export async function deleteContent(id: string) {
  const manager = await getGlobalContentManager();
  return manager.deleteContent(id);
}

export async function searchContent(query: string, options?: any) {
  const manager = await getGlobalContentManager();
  return manager.searchContent(query, options);
}

export async function syncContent(options?: any) {
  const manager = await getGlobalContentManager();
  return manager.syncContent(options);
}
