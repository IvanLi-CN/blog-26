import type { APIRoute } from "astro";

function decodePathSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// Server-rendered for the console; the static build skips it because it has no
// static paths.
export const prerender = process.env.BLOG_BUILD_TARGET !== "console";

export function getStaticPaths() {
  return [];
}

export const ALL: APIRoute = async ({ request, params }) => {
  const path = params.path || "";
  const match = path.match(/^_internal\/assets\/source\/(post|memo)\/([^/]+)\/([0-9a-f]+)$/iu);
  if (!match) return new Response("Not Found", { status: 404 });

  try {
    const { handleInternalAssetSourceRequest } = await import("@/server/public-media");
    return handleInternalAssetSourceRequest(request, {
      kind: match[1],
      slug: decodePathSegment(match[2]),
      mediaHash: match[3],
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
};
