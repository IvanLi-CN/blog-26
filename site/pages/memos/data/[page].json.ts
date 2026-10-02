import type { APIRoute, GetStaticPaths } from "astro";
import { buildPublicMemoStaticPages } from "../../../lib/memo-pagination";
import { getSnapshot } from "../../../lib/public-site";

export const getStaticPaths: GetStaticPaths = async () => {
  const snapshot = await getSnapshot();
  return buildPublicMemoStaticPages(snapshot.memos).map((page) => ({
    params: { page: page.page },
    props: { page },
  }));
};

export const GET: APIRoute = ({ props }) =>
  new Response(JSON.stringify(props.page), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
