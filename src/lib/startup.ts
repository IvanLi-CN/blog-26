/**
 * @file src/lib/startup.ts
 * @description 应用初始化逻辑（通过中间件调用）
 */

import { initializeDB } from './db';

let startupInitialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * 应用初始化
 * 确保数据库和缓存初始化完成
 */
export async function initializeApp(): Promise<void> {
  if (startupInitialized) {
    return;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    startupInitialized = true;
    console.log('🚀 开始应用初始化...');

    try {
      // 初始化数据库和缓存
      await initializeDB();
      console.log('✅ 应用初始化完成');
    } catch (error) {
      console.error('❌ 应用初始化失败:', error);
      // 即使初始化失败，也不阻止应用启动
    }
  })();

  return initializationPromise;
}
