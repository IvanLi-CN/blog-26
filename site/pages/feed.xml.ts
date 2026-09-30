import type { APIRoute } from "astro";
import { shouldReturnNotModified } from "@/lib/rss";
import { buildSiteFeed } from "../lib/feeds";
import { getSnapshot } from "../lib/public-site";

export const GET: APIRoute = async ({ request }) => {
  const snapshot = await getSnapshot();
  const built = buildSiteFeed(snapshot, "rss");
  const headers = new Headers({
    "content-type": "application/xml; charset=utf-8",
    "cache-control": "public, max-age=3600, s-maxage=3600",
    etag: built.etag,
    "last-modified": built.lastModified.toUTCString(),
  });
  if (shouldReturnNotModified(request, built.etag, built.lastModified)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(built.rss, {
    headers,
  });
};
