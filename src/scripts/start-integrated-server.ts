/**
 * 启动集成的 HTTP + WebSocket 服务器
 * 确保主应用和 WebSocket 服务器在同一个进程中运行
 */

import { startIntegratedServer } from "../server/integrated-server";

console.log("🚀 启动集成服务器 (HTTP + WebSocket)...");
console.log("这将在同一个进程中运行 Next.js 应用和 WebSocket 服务器");
console.log("确保事件管理器在两者之间正确共享");

// 调试：显示关键环境变量
console.log("🔍 [START-SERVER] 环境变量检查:", {
  NODE_ENV: process.env.NODE_ENV,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  ADMIN_EMAIL_SET: !!process.env.ADMIN_EMAIL,
  PORT: process.env.PORT,
});

startIntegratedServer();
