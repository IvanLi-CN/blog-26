"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createWSClient, httpBatchLink, splitLink, wsLink } from "@trpc/client";
import { useState } from "react";
import { trpc } from "../../lib/trpc";

function getBaseUrl() {
  if (typeof window !== "undefined") return "";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

function getWsUrl() {
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.hostname}:${window.location.port}/trpc-ws`;
  }
  return `ws://localhost:3001/trpc-ws`;
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => {
    // 创建 WebSocket 客户端
    const wsClient = createWSClient({
      url: getWsUrl(),
      onOpen: () => {
        console.log("WebSocket 连接已建立");
      },
      onClose: () => {
        console.log("WebSocket 连接已关闭");
      },
      onError: (error) => {
        console.error("WebSocket 连接错误:", error);
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
