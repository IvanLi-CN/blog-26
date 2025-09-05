"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createWSClient, httpBatchLink, splitLink, wsLink } from "@trpc/client";
import { useState } from "react";
import { trpc } from "../../lib/trpc";
import { buildHttpUrl, buildWebSocketUrl } from "../../lib/url-builder";

function getBaseUrl() {
  if (typeof window !== "undefined") return "";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  // 使用统一的URL构建工具
  return buildHttpUrl("");
}

// 使用统一的URL构建工具
function getWsUrl() {
  return buildWebSocketUrl("/trpc-ws");
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => {
    const wsUrl = getWsUrl();
    console.log("🔍 TRPCProvider 初始化:", {
      userAgent: typeof window !== "undefined" ? window.navigator.userAgent : "server",
      hostname: typeof window !== "undefined" ? window.location.hostname : "server",
      port: typeof window !== "undefined" ? window.location.port : "server",
      wsUrl,
    });

    // 创建 WebSocket 客户端
    const wsClient = createWSClient({
      url: wsUrl,
      onOpen: () => {
        console.log("✅ WebSocket 连接已建立");
      },
      onClose: () => {
        console.log("🔌 WebSocket 连接已关闭");
      },
      onError: (error) => {
        console.error("❌ WebSocket 连接错误:", error);
      },
    });

    return trpc.createClient({
      links: [
        splitLink({
          condition(op) {
            // 使用 WebSocket 处理 subscription
            return op.type === "subscription";
          },
          true: wsLink({
            client: wsClient,
          }),
          false: httpBatchLink({
            url: `${getBaseUrl()}/api/trpc`,
          }),
        }),
      ],
    });
  });

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
