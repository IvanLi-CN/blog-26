/**
 * WebSocket 服务器配置
 * 用于 tRPC subscription 功能
 */

import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { WebSocketServer } from "ws";

import { appRouter } from "./router";

let wss: WebSocketServer | null = null;

/**
 * 创建 WebSocket 服务器
 */
export function createWebSocketServer(port: number = 3001) {
  if (wss) {
    return wss;
  }

  wss = new WebSocketServer({
    port,
    perMessageDeflate: false,
  });

  const _handler = applyWSSHandler({
    wss,
    router: appRouter,
    createContext: async (_opts) => {
      // 为 WebSocket 创建上下文
      // 在开发环境中，我们暂时允许所有连接作为管理员
      // 在生产环境中，你需要从连接参数中验证认证信息

      // 创建模拟的请求对象和响应头
      const mockReq = new Request("ws://localhost:3000/api/trpc");
      const mockResHeaders = new Headers();

      // 检查是否是开发环境
      const isDev = process.env.NODE_ENV === "development";

      if (isDev) {
        // 开发环境：允许所有连接作为管理员
        return {
          req: mockReq,
          resHeaders: mockResHeaders,
          user: {
            id: "dev-user",
            email: "dev@example.com",
            nickname: "Dev User",
          },
          isAdmin: true,
        };
      }

      // 生产环境：需要实现真正的认证逻辑
      // 你可以从 opts.connectionParams 中获取认证信息
      return {
        req: mockReq,
        resHeaders: mockResHeaders,
        user: undefined,
        isAdmin: false,
      };
    },
    // 添加 keepAlive 配置以保持连接稳定
    keepAlive: {
      enabled: true,
      pingMs: 30000,
      pongWaitMs: 5000,
    },
  });

  wss.on("connection", (ws) => {
    console.log(`WebSocket 连接建立 (${wss?.clients.size} 个活跃连接)`);

    ws.once("close", () => {
      console.log(`WebSocket 连接关闭 (${wss?.clients.size} 个活跃连接)`);
    });
  });

  console.log(`WebSocket 服务器启动在端口 ${port}`);
  return wss;
}

/**
 * 关闭 WebSocket 服务器
 */
export function closeWebSocketServer() {
  if (wss) {
    wss.close();
    wss = null;
    console.log("WebSocket 服务器已关闭");
  }
}

/**
 * 获取当前 WebSocket 服务器实例
 */
export function getWebSocketServer() {
  return wss;
}
