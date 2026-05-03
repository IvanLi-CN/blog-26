import type { APIRoute } from "astro";
import { getCanonicalUrl, getSiteOrigin } from "../lib/public-site";

export const GET: APIRoute = async () => {
  const baseUrl = getSiteOrigin();
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin/",
    "Disallow: /api/",
    "Disallow: /private/",
    "Disallow: /static/",
    "",
    "User-agent: GPTBot",
    "Disallow: /",
    "",
    "User-agent: ChatGPT-User",
    "Disallow: /",
    "",
    "User-agent: CCBot",
    "Disallow: /",
    "",
    "User-agent: anthropic-ai",
    "Disallow: /",
    "",
    "User-agent: Claude-Web",
    "Disallow: /",
    "",
    `Host: ${baseUrl}`,
    `Sitemap: ${getCanonicalUrl("/sitemap.xml")}`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
};
