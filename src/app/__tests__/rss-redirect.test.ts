import { describe, expect, it } from "bun:test";
import { GET } from "../rss.xml/route";

describe("/rss.xml redirect", () => {
  it("redirects using x-forwarded host/proto when present", async () => {
    const request = new Request("http://localhost:3000/rss.xml", {
      headers: {
        "x-forwarded-host": "localhost:25090",
        "x-forwarded-proto": "http",
      },
    });

    const res = await GET(request);

    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("http://localhost:25090/feed.xml");
  });

  it("redirects using request origin when forwarded headers are missing", async () => {
    const request = new Request("https://example.com/rss.xml");
    const res = await GET(request);

    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://example.com/feed.xml");
  });
});
