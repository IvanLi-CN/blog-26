/**
 * 集成的 Next.js HTTP 服务器
 *
 * 实时能力已迁移到 tRPC + HTTP SSE（httpSubscriptionLink），不再使用 WebSocket。
 * 保留统一的启动入口，供 E2E 与脚本复用。
 */

import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { isAdminFromHeaders } from "../lib/auth";
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

        // 请求级日志：Forward Email 与管理员判定
        try {
          const emailHeaderName = process.env.SSO_EMAIL_HEADER_NAME || "Remote-Email";

          // Node 将 header 名字规范化为小写
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (Array.isArray(v)) headers.set(k, v.join(", "));
            else if (typeof v === "string") headers.set(k, v);
          }

          const forwardedEmail =
            headers.get(emailHeaderName) ||
            headers.get(emailHeaderName.toLowerCase()) ||
            headers.get("Remote-Email") ||
            headers.get("remote-email") ||
            headers.get("x-forwarded-email") ||
            null;

          const isAdmin = isAdminFromHeaders(headers);
          const method = req.method || "GET";
          const path = req.url || "/";

          console.log(
            `➡️  [Request] ${method} ${path} | ${emailHeaderName}=` +
              `${forwardedEmail ?? "<none>"} | isAdmin=${isAdmin}`
          );
        } catch (e) {
          console.warn("请求日志记录失败:", e);
        }

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

      // 启动后打印全部环境变量（按 key 排序）
      try {
        const entries = Object.entries(process.env as Record<string, string>)
          .map(([k, v]) => [k, v])
          .sort((a, b) => a[0].localeCompare(b[0]));
        console.log("🌐 环境变量 (process.env):");
        for (const [k, v] of entries) {
          console.log(`   ${k}=${v ?? ""}`);
        }
      } catch (e) {
        console.warn("打印环境变量失败:", e);
      }
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
