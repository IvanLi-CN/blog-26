import { getAdminEmail } from "@/lib/admin-config";
import { createMcpWebTransport } from "@/server/mcp";
import { runWithMcpAuth } from "@/server/mcp-auth-context";
import { resolveMcpSessionPersistenceKey } from "@/server/mcp-session";
import { resolveUserByPersonalAccessToken } from "@/server/services/personal-access-tokens";

type McpWebTransportState = Awaited<ReturnType<typeof createMcpWebTransport>>;
type McpSessionAuth = {
  isAdmin: boolean;
  userEmail?: string;
};

const mcpWebTransportSessions = new Map<
  string,
  McpWebTransportState & {
    auth: McpSessionAuth;
  }
>();

const JSON_RPC_VERSION = "2.0";

async function normalizeMcpRequest(request: Request): Promise<{
  parsedBody?: unknown;
  transportRequest: Request;
}> {
  const rebuildRequest = (body?: string) => {
    const init: RequestInit = {
      method: request.method,
      headers: new Headers(request.headers),
    };
    if (body !== undefined && request.method !== "GET" && request.method !== "HEAD") {
      init.body = body;
    }
    return new Request(request.url, init);
  };

  const contentType = request.headers.get("content-type") || "";
  if (request.method !== "POST" || !contentType.includes("application/json") || request.bodyUsed) {
    return {
      parsedBody: undefined,
      transportRequest: request,
    };
  }

  const rawBody = await request.text();
  if (!rawBody) {
    return {
      parsedBody: undefined,
      transportRequest: rebuildRequest(),
    };
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return {
      parsedBody: undefined,
      transportRequest: rebuildRequest(rawBody),
    };
  }

  return {
    parsedBody,
    transportRequest: rebuildRequest(rawBody),
  };
}

function readMcpSessionId(request: Request, response?: Response) {
  return (
    request.headers.get("mcp-session-id") ||
    request.headers.get("Mcp-Session-Id") ||
    response?.headers.get("mcp-session-id") ||
    response?.headers.get("Mcp-Session-Id") ||
    undefined
  );
}

function getJsonRpcId(parsedBody: unknown): string | number | null {
  if (parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)) {
    const id = (parsedBody as { id?: unknown }).id;
    if (typeof id === "string" || typeof id === "number" || id === null) return id;
  }
  return null;
}

export function isMcpInitializeRequest(parsedBody: unknown): boolean {
  return (
    !!parsedBody &&
    typeof parsedBody === "object" &&
    !Array.isArray(parsedBody) &&
    (parsedBody as { method?: unknown }).method === "initialize"
  );
}

export function createMcpJsonRpcErrorResponse(
  parsedBody: unknown,
  message: string,
  status = 400,
  code = -32000
): Response {
  return Response.json(
    {
      jsonrpc: JSON_RPC_VERSION,
      id: getJsonRpcId(parsedBody),
      error: { code, message },
    },
    { status }
  );
}

export function getMcpSessionCountForTests(): number {
  return mcpWebTransportSessions.size;
}

export function getMcpSessionAuthForTests(sessionId: string): McpSessionAuth | undefined {
  return mcpWebTransportSessions.get(sessionId)?.auth;
}

export async function handleMcpHttpRequest(request: Request) {
  const authHeader = request.headers.get("authorization");
  const requestAuth: McpSessionAuth = { isAdmin: false };

  if (typeof authHeader === "string") {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const rawToken = match?.[1]?.trim();
    if (rawToken) {
      try {
        const resolved = await resolveUserByPersonalAccessToken(rawToken);
        if (resolved) {
          requestAuth.userEmail = resolved.user.email;
          const adminEmail = getAdminEmail();
          requestAuth.isAdmin = !!adminEmail && requestAuth.userEmail === adminEmail;
        }
      } catch (error) {
        console.warn("[MCP] PAT resolve failed:", error);
      }
    }
  }

  const requestedSessionId = readMcpSessionId(request);
  const existingTransportState = requestedSessionId
    ? mcpWebTransportSessions.get(requestedSessionId)
    : undefined;
  const sessionAuth =
    requestAuth.isAdmin || requestAuth.userEmail ? requestAuth : existingTransportState?.auth;
  const auth = sessionAuth ?? requestAuth;

  return runWithMcpAuth(auth, async () => {
    const { parsedBody, transportRequest } = await normalizeMcpRequest(request);

    if (request.method === "DELETE" && requestedSessionId && !existingTransportState) {
      return new Response(null, { status: 204 });
    }

    if (requestedSessionId && !existingTransportState) {
      return createMcpJsonRpcErrorResponse(
        parsedBody,
        "Unknown MCP session. Reinitialize before sending further requests."
      );
    }

    if (!existingTransportState && !isMcpInitializeRequest(parsedBody)) {
      return createMcpJsonRpcErrorResponse(
        parsedBody,
        "Missing MCP session. Send an initialize request first."
      );
    }

    const transportState = existingTransportState || {
      ...(await createMcpWebTransport()),
      auth,
    };
    const response = await transportState.transport.handleRequest(
      transportRequest,
      parsedBody !== undefined ? { parsedBody } : undefined
    );
    const resolvedSessionId = resolveMcpSessionPersistenceKey({
      requestedSessionId,
      responseSessionId: readMcpSessionId(new Request(request.url), response),
      transportSessionId: transportState.transport.sessionId,
      hasExistingSession: !!existingTransportState,
    });

    if (resolvedSessionId) {
      transportState.transport.onclose = () => {
        mcpWebTransportSessions.delete(resolvedSessionId);
      };
      transportState.auth = auth;
      mcpWebTransportSessions.set(resolvedSessionId, transportState);
    }

    if (request.method === "DELETE" && resolvedSessionId) {
      mcpWebTransportSessions.delete(resolvedSessionId);
      await transportState.transport.close().catch(() => undefined);
    }

    return response;
  });
}
