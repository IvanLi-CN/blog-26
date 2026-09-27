import type { APIRoute } from "astro";
import { createPublicWebManifest, getPublicPwaAssetPaths } from "../lib/public-pwa";
import { toPublicSitePath } from "../lib/runtime-urls";

export const prerender = true;

export const GET: APIRoute = async () => {
  const assets = await getPublicPwaAssetPaths();
  const manifest = createPublicWebManifest(assets, toPublicSitePath);
  return new Response(`${JSON.stringify(manifest, null, 2)}\n`, {
    headers: { "content-type": "application/manifest+json; charset=utf-8" },
  });
};
