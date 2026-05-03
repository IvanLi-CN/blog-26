import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createContext } from "@/server/context";
import { appRouter } from "@/server/router";

export function handleTrpcHttpRequest(request: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext,
  });
}
