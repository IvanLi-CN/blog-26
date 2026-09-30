function pathFromParams(path: string | undefined) {
  return `/${(path || "").replace(/^\/+/, "")}`.replace(/\/+/g, "/");
}

function notFound() {
  return Response.json({ error: "Not Found" }, { status: 404 });
}

function decodePathSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function fileRouteParams(request: Request, fallbackPath: string) {
  const rawPathname = new URL(request.url).pathname;
  const marker = "/api/files/";
  const markerIndex = rawPathname.indexOf(marker);
  const rawFilePath =
    markerIndex >= 0 ? rawPathname.slice(markerIndex + marker.length) : fallbackPath;
  const [rawSource, ...rawSegments] = rawFilePath.split("/");

  return {
    source: decodePathSegment(rawSource || ""),
    path: rawSegments.filter(Boolean).map(decodePathSegment),
  };
}

export function withoutIdentity(request: Request) {
  const headers = new Headers(request.headers);
  const identityHeaders = ["authorization", "cookie", "remote-email", "x-forwarded-email"];
  const configuredSsoHeader = process.env.SSO_EMAIL_HEADER_NAME?.trim();
  if (configuredSsoHeader) identityHeaders.push(configuredSsoHeader);
  for (const name of identityHeaders) {
    headers.delete(name);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }
  return new Request(request.url, init);
}

export async function ALL({ request, params }: { request: Request; params: { path?: string } }) {
  const { resolveRuntimeContext } = await import("@/lib/runtime-context");
  const runtimeRequest =
    resolveRuntimeContext(request).mode === "public" ? withoutIdentity(request) : request;
  const path = pathFromParams(params.path);

  if (path === "/health") {
    const { extractAuthFromRequest } = await import("@/lib/auth-utils");
    const auth = await extractAuthFromRequest(runtimeRequest);
    return Response.json(
      {
        status: "ok",
        runtime: "console",
        authenticated: Boolean(auth.user),
        isAdmin: auth.isAdmin,
      },
      { headers: { "cache-control": "no-store" } }
    );
  }

  if (path === "/trpc" || path.startsWith("/trpc/")) {
    const { handleTrpcHttpRequest } = await import("@/server/trpc-http");
    return handleTrpcHttpRequest(runtimeRequest);
  }

  if (path === "/dev" || path.startsWith("/dev/")) {
    if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEV_ENDPOINTS !== "true") {
      return notFound();
    }
    const { handleDevApiRequest } = await import("@/server/dev-api/router");
    return handleDevApiRequest(runtimeRequest, path.replace(/^\/dev/, "") || "/");
  }

  if (path === "/test" || path.startsWith("/test/")) {
    if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEV_ENDPOINTS !== "true") {
      return notFound();
    }
    const { handleTestApiRequest } = await import("@/server/test-api/router");
    return handleTestApiRequest(runtimeRequest, path.replace(/^\/test/, "") || "/");
  }

  if (path === "/tags/organize" || path.startsWith("/tags/organize/")) {
    const { handleAdminApiRequest } = await import("@/server/admin-api/router");
    return handleAdminApiRequest(runtimeRequest, "/tags/organize");
  }

  if (path === "/public" || path.startsWith("/public/")) {
    const { handlePublicApiRequest } = await import("@/server/public-api/router");
    return handlePublicApiRequest(runtimeRequest, path.replace(/^\/public/, "") || "/");
  }

  if (path === "/admin" || path.startsWith("/admin/")) {
    const { handleAdminApiRequest } = await import("@/server/admin-api/router");
    return handleAdminApiRequest(runtimeRequest, path.replace(/^\/admin/, "") || "/");
  }

  const filesMatch = path.match(/^\/files\/([^/]+)\/?(.*)$/);
  if (filesMatch) {
    if (request.method !== "OPTIONS") {
      const { extractAuthFromRequest } = await import("@/lib/auth-utils");
      const auth = await extractAuthFromRequest(runtimeRequest);
      if (!auth.isAdmin) {
        return notFound();
      }
    }

    const tail = filesMatch[2] || "";
    const fileParams = fileRouteParams(request, `${filesMatch[1]}/${tail}`);
    const { handleFilesApiRequest } = await import("@/server/files-api/router");
    return handleFilesApiRequest(runtimeRequest, fileParams);
  }

  return notFound();
}

export const prerender = process.env.CONSOLE_RUNTIME !== "true";

export function getStaticPaths() {
  return [];
}
