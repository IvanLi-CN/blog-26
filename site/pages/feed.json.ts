import type { APIRoute } from "astro";
import { buildSiteFeed } from "../lib/feeds";
import { getSnapshot } from "../lib/public-site";

export const GET: APIRoute = async () => {
  const snapshot = await getSnapshot();
  const built = buildSiteFeed(snapshot, "json");
  return new Response(built.json ?? "{}", {
    headers: {
      "content-type": "application/feed+json; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
};
