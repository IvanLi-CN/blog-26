/**
 * 集成的 Next.js HTTP 服务器
 *
 * 实时能力已迁移到 tRPC + HTTP SSE（httpSubscriptionLink），不再使用 WebSocket。
 * 保留统一的启动入口，供 E2E 与脚本复用。
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { getAdminEmail } from "../lib/admin-config";
import { isAdminFromHeaders } from "../lib/auth";
import { buildHttpUrl } from "../lib/url-builder";
import { getMcpTransport } from "./mcp";
import { runWithMcpAuth } from "./mcp-auth-context";
import { resolveUserByPersonalAccessToken } from "./services/personal-access-tokens";

// 强化修复 Next.js 15 在所有环境中的 AsyncLocalStorage 问题
console.log("🔧 [INTEGRATED-SERVER] 修复 AsyncLocalStorage...");
if (!globalThis.AsyncLocalStorage) {
  console.log("🔧 设置 globalThis.AsyncLocalStorage");
  globalThis.AsyncLocalStorage = AsyncLocalStorage;
}

// 确保 Node.js 环境中的 AsyncLocalStorage 可用
if (typeof global !== "undefined" && !global.AsyncLocalStorage) {
  console.log("🔧 设置 global.AsyncLocalStorage");
  global.AsyncLocalStorage = AsyncLocalStorage;
}

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
        const pathname = parsedUrl.pathname || "/";

        // MCP endpoint (integrated)
        if (pathname === "/mcp") {
          const transport = await getMcpTransport();

          // 仅使用 PAT（Authorization: Bearer <token>）进行鉴权
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (Array.isArray(v)) headers.set(k, v.join(", "));
            else if (typeof v === "string") headers.set(k, v);
          }

          const authz = headers.get("authorization") || headers.get("Authorization");
          let userEmail: string | undefined;
          let isAdmin = false;
          if (authz) {
            const m = authz.match(/^Bearer\s+(.+)$/i);
            const rawToken = m?.[1]?.trim();
            if (rawToken) {
              try {
                const resolved = await resolveUserByPersonalAccessToken(rawToken);
                if (resolved) {
                  userEmail = resolved.user.email;
                  const adminEmail = getAdminEmail();
                  isAdmin = !!adminEmail && userEmail === adminEmail;
                }
              } catch (e) {
                console.warn("[MCP] PAT resolve failed:", e);
              }
            }
          }

          await runWithMcpAuth({ isAdmin, userEmail }, async () => {
            await transport.handleRequest(req as any, res as any);
          });
          return;
        }

        // 请求级日志：打印所有请求头 + Forward Email 与管理员判定
        try {
          const emailHeaderName = process.env.SSO_EMAIL_HEADER_NAME || "Remote-Email";

          // Node 将 header 名字规范化为小写
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (Array.isArray(v)) headers.set(k, v.join(", "));
            else if (typeof v === "string") headers.set(k, v);
          }
          // 依次尝试若干可能的邮箱头，并记录命中的是哪个
          const candidateHeaders = [
            emailHeaderName,
            emailHeaderName.toLowerCase(),
            "Remote-Email",
            "remote-email",
            "x-forwarded-email",
          ];
          let forwardedEmail: string | null = null;
          let matchedEmailHeader: string | null = null;
          for (const key of candidateHeaders) {
            const val = headers.get(key);
            if (val) {
              forwardedEmail = val;
              matchedEmailHeader = key;
              break;
            }
          }

          const isAdmin = isAdminFromHeaders(headers);
          const method = req.method || "GET";
          const path = req.url || "/";

          console.log(
            `➡️  [Request] ${method} ${path} | ForwardEmail(${emailHeaderName})=` +
              `${forwardedEmail ?? "<none>"} | matchedHeader=${matchedEmailHeader ?? "<none>"} | isAdmin=${isAdmin}`
          );

          // 按 key 排序打印所有请求头，便于排查实际传入的 header 名与大小写
          try {
            const allHeaderEntries = Array.from(headers.entries()).sort((a, b) =>
              a[0].localeCompare(b[0])
            );
            console.log("🧾 请求头 (normalized by Node):");
            for (const [k, v] of allHeaderEntries) {
              console.log(`   ${k}: ${v}`);
            }

            // 额外打印原始 rawHeaders，保留客户端发送时的大小写与顺序
            if (Array.isArray((req as any).rawHeaders)) {
              const raw = (req as any).rawHeaders as Array<string>;
              console.log("🧾 原始请求头 (req.rawHeaders):");
              for (let i = 0; i < raw.length; i += 2) {
                const k = raw[i];
                const v = raw[i + 1];
                console.log(`   ${k}: ${v}`);
              }
            }
          } catch (e) {
            console.warn("打印请求头失败:", e);
          }
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
