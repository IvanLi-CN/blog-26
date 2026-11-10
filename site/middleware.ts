import type { MiddlewareHandler } from "astro";
import { hasTrustedPublicOrigin } from "@/lib/public-cors";

const IMMUTABLE_ASSET_PATH = /\.(?:avif|css|gif|ico|jpeg|jpg|js|map|png|svg|webp|woff2?)$/i;

export const onRequest: MiddlewareHandler = async ({ request, url }, next) => {
  const isApiMutation =
    process.env.BLOG_BUILD_TARGET === "console" &&
    url.pathname.startsWith("/api/") &&
    !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (isApiMutation && !hasTrustedPublicOrigin(request)) {
    return new Response(JSON.stringify({ error: "请求来源不受信任" }), {
      status: 403,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const response = await next();
  if (process.env.BLOG_BUILD_TARGET !== "console") return response;

  const headers = new Headers(response.headers);
  const pathname = url.pathname;
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
};
