import type { APIRoute } from "astro";
import { buildTagFeed } from "../../../lib/feeds";
import { getSnapshot } from "../../../lib/public-site";

export async function getStaticPaths() {
  const snapshot = await getSnapshot();
  return snapshot.tags.summaries.map((summary) => ({
    params: { tagSegments: summary.segments.join("/") },
    props: { tagPath: summary.name },
  }));
}

export const GET: APIRoute = async ({ props }) => {
  const snapshot = await getSnapshot();
  const built = buildTagFeed(snapshot, props.tagPath as string);
  return new Response(built.rss, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
};
