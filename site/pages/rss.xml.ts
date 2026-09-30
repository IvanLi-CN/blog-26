import type { APIRoute } from "astro";
import { buildSiteFeed } from "../lib/feeds";
import { getSnapshot } from "../lib/public-site";
import { toPublicSitePath } from "../lib/runtime-urls";

export const GET: APIRoute = async () => {
  if (process.env.CONSOLE_RUNTIME === "true") {
    return new Response(null, {
      status: 301,
      headers: {
        location: toPublicSitePath("/feed.xml"),
        "cache-control": "public, max-age=86400",
      },
    });
  }

  const snapshot = await getSnapshot();
  const built = buildSiteFeed(snapshot, "rss");
  return new Response(built.rss, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
      etag: built.etag,
      "last-modified": built.lastModified.toUTCString(),
    },
  });
};
