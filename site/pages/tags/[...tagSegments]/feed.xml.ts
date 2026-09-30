import type { APIRoute } from "astro";
import { shouldReturnNotModified } from "@/lib/rss";
import { buildTagFeed } from "../../../lib/feeds";
import { getSnapshot } from "../../../lib/public-site";

export async function getStaticPaths() {
  const snapshot = await getSnapshot();
  return snapshot.tags.summaries.map((summary) => ({
    params: { tagSegments: summary.segments.join("/") },
    props: { tagPath: summary.name },
  }));
}

export const GET: APIRoute = async ({ props, params, request }) => {
  const snapshot = await getSnapshot();
  const tagPath =
    (props.tagPath as string | undefined) ||
    (params.tagSegments || "").split("/").filter(Boolean).join("/");
  const summary = snapshot.tags.summaries.find(
    (candidate) => candidate.segments.join("/") === tagPath || candidate.name === tagPath
  );
  if (!summary) return new Response("Not Found", { status: 404 });
  const built = buildTagFeed(snapshot, tagPath);
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
