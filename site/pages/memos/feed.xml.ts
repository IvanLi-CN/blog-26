import type { APIRoute } from "astro";
import { buildMemosFeed } from "../../lib/feeds";
import { getSnapshot } from "../../lib/public-site";

export const GET: APIRoute = async () => {
  const snapshot = await getSnapshot();
  const built = buildMemosFeed(snapshot);
  return new Response(built.rss, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
};
