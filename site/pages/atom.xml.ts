import type { APIRoute } from "astro";
import { buildSiteFeed } from "../lib/feeds";
import { getSnapshot } from "../lib/public-site";

export const GET: APIRoute = async () => {
  const snapshot = await getSnapshot();
  const built = buildSiteFeed(snapshot, "atom");
  return new Response(built.atom ?? "", {
    headers: {
      "content-type": "application/atom+xml; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
};
