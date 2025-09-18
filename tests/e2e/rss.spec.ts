import { expect, test } from "@playwright/test";

const feeds = [
  { path: "/feed.xml", expectRoot: /<rss/i, expectItems: true },
  { path: "/memos/feed.xml", expectRoot: /<rss/i, expectItems: true },
  { path: "/tags/test/feed.xml", expectRoot: /<rss/i, expectItems: false },
];

for (const f of feeds) {
  test(`GET ${f.path} returns XML with items`, async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}${f.path}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/xml");
    const text = await res.text();
    expect(text).toMatch(f.expectRoot);

    if (f.expectItems) {
      expect(text).toMatch(/<item>/i);
    }

    const etag = res.headers().etag;
    const lastModified = res.headers()["last-modified"];
    expect(etag).toBeTruthy();
    expect(lastModified).toBeTruthy();

    const res304 = await request.get(`${baseURL}${f.path}`, {
      headers: { "If-None-Match": etag },
    });
    expect(res304.status()).toBe(304);
  });
}

test("/rss.xml redirects to /feed.xml", async ({ request, baseURL }) => {
  const res = await request.fetch(`${baseURL}/rss.xml`, { maxRedirects: 0 });
  expect(res.status()).toBe(301);
  expect(res.headers().location).toContain("/feed.xml");
});
