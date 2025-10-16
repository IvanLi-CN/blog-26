import { AsyncLocalStorage } from "node:async_hooks";

export interface McpAuthContext {
  isAdmin: boolean;
  userEmail?: string;
}

const storage = new AsyncLocalStorage<McpAuthContext>();

export function runWithMcpAuth<T>(ctx: McpAuthContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getMcpAuthContext(): McpAuthContext {
  return storage.getStore() ?? { isAdmin: false };
}

export function requireAdmin(): void {
  const ctx = getMcpAuthContext();
  if (!ctx.isAdmin) {
    const err = new Error("Admin privileges required");
    // attach a recognizable code for upstream handlers
    (err as any).code = "MCP_ADMIN_REQUIRED";
    throw err;
  }
}
