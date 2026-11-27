#!/usr/bin/env bun

import { resolve } from "node:path";
import { handlePublicAssetFacadeRequest } from "@/server/public-media";
import { type PublicMediaFetcher, packagePublicMedia } from "./package-public-media";

/**
 * Packages the Web Demo's public media into the static artifact.
 *
 * The Demo has no backend, so `/api/public/assets/...` must become real files
 * under `/_content/assets/...` at build time. The variants are rendered by the
 * same local code path the Demo server used (`handlePublicAssetFacadeRequest`
 * with `WEB_DEMO_BUILD=true`), in-process and without HTTP.
 */

const FACADE_PREFIX = "/api/public/assets/";
const ASSET_PATH_RE =
  /^\/assets\/(post|memo)\/([^/]+)\/([0-9a-f]+)(?:\/([a-z0-9-]+))?\/(card|cover|content|full|social|poster|play)\.([a-z0-9]+)$/iu;

function createLocalMediaFetcher(): PublicMediaFetcher {
  return async (input) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const pathname = new URL(raw, "http://demo.invalid").pathname;
    if (!pathname.startsWith(FACADE_PREFIX)) {
      return new Response("Not a public media facade URL", { status: 404 });
    }
    const match = ASSET_PATH_RE.exec(pathname.slice("/api/public".length));
    if (!match) return new Response("Not Found", { status: 404 });
    const [, kind, encodedSlug, mediaHash, renderId, variant, ext] = match;
    return handlePublicAssetFacadeRequest(new Request(`http://demo.invalid${pathname}`), {
      kind,
      slug: decodeURIComponent(encodedSlug),
      mediaHash,
      renderId,
      variant,
      ext,
    });
  };
}

export async function packageWebDemoMedia(options: { siteDistDir?: string } = {}) {
  const siteDistDir = resolve(options.siteDistDir ?? "web-demo-site-dist");
  // Every facade URL resolves through `fetchImpl` below, so this origin only
  // satisfies the packager's absolute-origin contract; nothing is fetched.
  const siteUrl = process.env.WEB_DEMO_PUBLIC_SITE_URL || "https://blog-demo.ivanli.cc";
  return packagePublicMedia({
    siteDistDir,
    siteUrl,
    mediaOrigin: siteUrl,
    fetchImpl: createLocalMediaFetcher(),
    includeDerivedWatermarkVariants: true,
    includeBaseMediaVariants: true,
  });
}

if (import.meta.main) {
  packageWebDemoMedia()
    .then((manifest) => {
      console.log(
        `Web Demo media packaged: ${manifest.packagedCount} files, external ${manifest.externalCount}`
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
