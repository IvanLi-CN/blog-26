import { afterEach, describe, expect, test } from "bun:test";
import { onRequest } from "../../site/middleware";

afterEach(() => {
  delete process.env.CONSOLE_RUNTIME;
});

describe("console response cache policy", () => {
  test("keeps admin preview assets private", async () => {
    process.env.CONSOLE_RUNTIME = "true";
    const response = await onRequest(
      {
        request: new Request(
          "https://console.ivanli.cc/api/admin/preview/assets/post/draft/abc123/cover.webp"
        ),
      },
      async () => new Response("private asset")
    );

    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  test("keeps public media assets cacheable", async () => {
    process.env.CONSOLE_RUNTIME = "true";
    const response = await onRequest(
      {
        request: new Request(
          "https://console.ivanli.cc/api/public/assets/post/public/abc123/cover.webp"
        ),
      },
      async () => new Response("public asset")
    );

    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  test("keeps file API assets private", async () => {
    process.env.CONSOLE_RUNTIME = "true";
    const response = await onRequest(
      {
        request: new Request("https://console.ivanli.cc/api/files/local/drafts/private.webp"),
      },
      async () => new Response("private file")
    );

    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  test("does not make dynamic feeds immutable", async () => {
    process.env.CONSOLE_RUNTIME = "true";
    const response = await onRequest(
      { request: new Request("https://console.ivanli.cc/feed.xml") },
      async () => new Response("<rss />", { headers: { "cache-control": "public, max-age=3600" } })
    );

    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});
