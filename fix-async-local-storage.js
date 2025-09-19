/**
 * AsyncLocalStorage 修复脚本
 * 在 Next.js 启动前确保 AsyncLocalStorage 可用
 */

import { AsyncLocalStorage } from "node:async_hooks";

console.log("🔧 [FIX-ALS] 设置 AsyncLocalStorage...");

// 设置到所有可能的全局位置
globalThis.AsyncLocalStorage = AsyncLocalStorage;

if (typeof global !== "undefined") {
  global.AsyncLocalStorage = AsyncLocalStorage;
}

if (typeof window !== "undefined") {
  window.AsyncLocalStorage = AsyncLocalStorage;
}

console.log("✅ [FIX-ALS] AsyncLocalStorage 设置完成");
