/**
 * WebSocket 集成到 Next.js 应用
 * 在主应用进程中启动 WebSocket 服务器，确保事件管理器共享
 */

import { createServer } from "node:http";
import { parse } from "node:url";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import next from "next";
import { WebSocketServer } from "ws";
import { buildHttpUrl, buildMockRequestUrl, buildWebSocketUrl } from "../lib/url-builder";
import { appRouter } from "./router";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
// 在测试环境中默认使用3000端口，其他环境使用3001
const defaultPort = process.env.NODE_ENV === "test" ? "3000" : "3001";
const port = parseInt(process.env.PORT || defaultPort, 10);

// 创建 Next.js 应用
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

let server: any = null;
let wss: WebSocketServer | null = null;

/**
 * 启动集成的 HTTP + WebSocket 服务器
 */
export async function startIntegratedServer() {
  if (server) {
    console.log("服务器已经在运行中");
    return;
  }

  try {
    await app.prepare();

    // 创建 HTTP 服务器
    server = createServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url || "", true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error("处理请求时出错:", err);
        res.statusCode = 500;
        res.end("内部服务器错误");
      }
    });

    // 创建 WebSocket 服务器，复用同一个 HTTP 服务器
    wss = new WebSocketServer({
      server,
      path: "/trpc-ws", // 使用特定路径避免冲突
    });

    // 应用 tRPC WebSocket 处理器
    const _handler = applyWSSHandler({
      wss,
      router: appRouter,
      createContext: async () => {
        // 在开发环境和测试环境中允许所有连接作为管理员
        const isDev = process.env.NODE_ENV === "development";
        const isTest = process.env.NODE_ENV === "test";

        // 创建模拟的请求对象和响应头
        const mockReq = new Request(buildMockRequestUrl("/api/trpc"));
        const mockResHeaders = new Headers();

        if (isDev || isTest) {
          return {
            req: mockReq,
            resHeaders: mockResHeaders,
            user: {
              id: isTest ? "test-user" : "dev-user",
              email: isTest ? "admin@test.com" : "dev@example.com",
              nickname: isTest ? "Test User" : "Dev User",
            },
            isAdmin: true,
          };
        }

        return {
          req: mockReq,
          resHeaders: mockResHeaders,
          user: undefined,
          isAdmin: false,
        };
      },
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

    // 启动服务器
    server.listen(port, () => {
      console.log(`🚀 集成服务器启动成功:`);
      console.log(`   - HTTP: ${buildHttpUrl("")}`);
      console.log(`   - WebSocket: ${buildWebSocketUrl("/trpc-ws")}`);
      console.log(`   - 环境: ${dev ? "开发" : "生产"}`);
    });
  } catch (error) {
    console.error("启动集成服务器失败:", error);
    process.exit(1);
  }
}

/**
 * 关闭集成服务器
 */
export function stopIntegratedServer() {
  if (wss) {
    wss.close();
    wss = null;
    console.log("WebSocket 服务器已关闭");
  }

  if (server) {
    server.close();
    server = null;
    console.log("HTTP 服务器已关闭");
  }
}

/**
 * 获取当前 WebSocket 服务器实例
 */
export function getWebSocketServer() {
  return wss;
}

// 优雅关闭
process.on("SIGINT", () => {
  console.log("\n正在关闭集成服务器...");
  stopIntegratedServer();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n正在关闭集成服务器...");
  stopIntegratedServer();
  process.exit(0);
});
