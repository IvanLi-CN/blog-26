export const PRIVATE_RESPONSE_CACHE_CONTROL = "private, no-store";
export const PRIVATE_RESPONSE_VARY = "cookie, authorization";
export const PRIVATE_RESPONSE_ROBOTS_TAG = "noindex, nofollow";

/**
 * The production gateway dispatches API handlers directly and returns their
 * responses untouched. Anything whose body can depend on the requesting
 * identity must therefore default to non-shared caching, and handlers that
 * deliberately publish cacheable output must keep control of the header.
 */
export function isPrivateByDefaultPath(pathname: string) {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/_internal" ||
    pathname.startsWith("/_internal/")
  );
}

export function applyPrivateResponseDefaults(response: Response, pathname: string) {
  if (!isPrivateByDefaultPath(pathname)) return response;
  if (response.headers.has("cache-control")) return response;

  const headers = new Headers(response.headers);
  headers.set("cache-control", PRIVATE_RESPONSE_CACHE_CONTROL);
  headers.set("vary", PRIVATE_RESPONSE_VARY);
  headers.set("x-robots-tag", PRIVATE_RESPONSE_ROBOTS_TAG);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
