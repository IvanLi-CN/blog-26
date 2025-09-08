/**
 * 集成的 Next.js HTTP 服务器
 *
 * 实时能力已迁移到 tRPC + HTTP SSE（httpSubscriptionLink），不再使用 WebSocket。
 * 保留统一的启动入口，供 E2E 与脚本复用。
 */

import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { buildHttpUrl } from "../lib/url-builder";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
// 在测试环境中默认使用25090端口，其他环境使用25091
const defaultPort = process.env.NODE_ENV === "test" ? "25090" : "25091";
const port = parseInt(process.env.PORT || defaultPort, 10);

// 创建 Next.js 应用
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

let server: any = null;
// 仅 HTTP 服务器

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

    // SSE 实时能力由 tRPC + httpSubscriptionLink 提供，无需 WS
    console.log("ℹ️ 实时能力使用 HTTP SSE（无 WebSocket）");

    // 启动服务器
    server.listen(port, () => {
      console.log(`🚀 集成服务器启动成功:`);
      console.log(`   - HTTP: ${buildHttpUrl("")}`);
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
  if (server) {
    server.close();
    server = null;
    console.log("HTTP 服务器已关闭");
  }
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
