const IMMUTABLE_ASSET_PATH = /\.(?:avif|css|gif|ico|jpeg|jpg|js|map|png|svg|webp|woff2?)$/i;

export async function onRequest({ request }, next) {
  const response = await next();
  if (process.env.CONSOLE_RUNTIME !== "true") return response;

  const headers = new Headers(response.headers);
  const pathname = new URL(request.url).pathname;
  const isPrivateAssetPath =
    (pathname.startsWith("/api/") && !pathname.startsWith("/api/public/assets/")) ||
    pathname.startsWith("/_internal/");
  if (
    response.status < 400 &&
    !isPrivateAssetPath &&
    (pathname.startsWith("/_astro/") || IMMUTABLE_ASSET_PATH.test(pathname))
  ) {
    headers.set("cache-control", "public, max-age=31536000, immutable");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  headers.set("cache-control", "private, no-store");
  headers.set("x-robots-tag", "noindex, nofollow");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
