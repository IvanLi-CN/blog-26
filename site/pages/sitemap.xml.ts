import type { APIRoute } from "astro";
import { getCanonicalUrl, getSnapshot } from "../lib/public-site";

function escapeXml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export const GET: APIRoute = async () => {
  const snapshot = await getSnapshot();
  const generatedAt = snapshot.generatedAt;

  const entries = [
    { loc: getCanonicalUrl("/"), lastmod: generatedAt, changefreq: "daily", priority: "1.0" },
    {
      loc: getCanonicalUrl("/about"),
      lastmod: generatedAt,
      changefreq: "monthly",
      priority: "0.6",
    },
    { loc: getCanonicalUrl("/posts"), lastmod: generatedAt, changefreq: "daily", priority: "0.8" },
    { loc: getCanonicalUrl("/memos"), lastmod: generatedAt, changefreq: "daily", priority: "0.7" },
    { loc: getCanonicalUrl("/tags"), lastmod: generatedAt, changefreq: "daily", priority: "0.6" },
    {
      loc: getCanonicalUrl("/projects"),
      lastmod: generatedAt,
      changefreq: "weekly",
      priority: "0.5",
    },
    {
      loc: getCanonicalUrl("/search"),
      lastmod: generatedAt,
      changefreq: "weekly",
      priority: "0.4",
    },
    ...snapshot.posts.map((post) => ({
      loc: getCanonicalUrl(`/posts/${post.slug}`),
      lastmod: post.updateDate ?? post.publishDate,
      changefreq: "weekly",
      priority: "0.7",
    })),
    ...snapshot.memos.map((memo) => ({
      loc: getCanonicalUrl(`/memos/${memo.slug}`),
      lastmod: memo.updatedAt ?? memo.publishedAt ?? memo.createdAt,
      changefreq: "weekly",
      priority: "0.6",
    })),
    ...snapshot.tags.summaries.map((tag) => ({
      loc: getCanonicalUrl(
        `/tags/${tag.segments.map((segment) => encodeURIComponent(segment)).join("/")}`
      ),
      lastmod: generatedAt,
      changefreq: "daily",
      priority: "0.5",
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
    .map(
      (entry) =>
        `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n    <lastmod>${escapeXml(new Date(entry.lastmod).toISOString())}</lastmod>\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`
    )
    .join("\n")}\n</urlset>\n`;

  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
};
