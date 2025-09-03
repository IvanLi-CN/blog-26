/**
 * WebSocket 服务器启动脚本
 * 用于开发环境启动 tRPC WebSocket 服务器
 */

import { createWebSocketServer } from "../server/websocket";

// 启动 WebSocket 服务器
const port = 3002;
createWebSocketServer(port);

console.log(`WebSocket 服务器已启动在端口 ${port}`);
console.log("用于 tRPC subscription 功能");

// 优雅关闭
process.on("SIGINT", () => {
  console.log("\n正在关闭 WebSocket 服务器...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n正在关闭 WebSocket 服务器...");
  process.exit(0);
});
