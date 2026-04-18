import { getAdminEmail } from "@/lib/admin-config";
import { createMcpWebTransport } from "@/server/mcp";
import { runWithMcpAuth } from "@/server/mcp-auth-context";
import { resolveUserByPersonalAccessToken } from "@/server/services/personal-access-tokens";

type McpWebTransportState = Awaited<ReturnType<typeof createMcpWebTransport>>;

const mcpWebTransportSessions = new Map<string, McpWebTransportState>();

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

export function resolveMcpSessionPersistenceKey(params: {
  requestedSessionId?: string;
  responseSessionId?: string;
  transportSessionId?: string;
  hasExistingSession: boolean;
}) {
  const { requestedSessionId, responseSessionId, transportSessionId, hasExistingSession } = params;
  if (responseSessionId) {
    return responseSessionId;
  }
  if (hasExistingSession) {
    return requestedSessionId || transportSessionId;
  }
  return transportSessionId;
}

export async function handleMcpHttpRequest(request: Request) {
  const authHeader = request.headers.get("authorization");
  let userEmail: string | undefined;
  let isAdmin = false;

  if (typeof authHeader === "string") {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const rawToken = match?.[1]?.trim();
    if (rawToken) {
      try {
        const resolved = await resolveUserByPersonalAccessToken(rawToken);
        if (resolved) {
          userEmail = resolved.user.email;
          const adminEmail = getAdminEmail();
          isAdmin = !!adminEmail && userEmail === adminEmail;
        }
      } catch (error) {
        console.warn("[MCP] PAT resolve failed:", error);
      }
    }
  }

  return runWithMcpAuth({ isAdmin, userEmail }, async () => {
    const requestedSessionId = readMcpSessionId(request);
    const existingTransportState = requestedSessionId
      ? mcpWebTransportSessions.get(requestedSessionId)
      : undefined;

    if (request.method === "DELETE" && requestedSessionId && !existingTransportState) {
      return new Response(null, { status: 204 });
    }

    const transportState = existingTransportState || (await createMcpWebTransport());
    const { parsedBody, transportRequest } = await normalizeMcpRequest(request);
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
      mcpWebTransportSessions.set(resolvedSessionId, transportState);
    }

    if (request.method === "DELETE" && resolvedSessionId) {
      mcpWebTransportSessions.delete(resolvedSessionId);
      await transportState.transport.close().catch(() => undefined);
    }

    return response;
  });
}
