import { describe, expect, it } from "bun:test";
import { getPublicApiBaseUrl, toPublicApiUrl, toPublicAssetUrl } from "@/lib/public-runtime-url";

describe("public-runtime-url", () => {
  it("uses PUBLIC_API_BASE_URL for api and asset URLs", () => {
    process.env.PUBLIC_API_BASE_URL = "https://api.example.test/";

    expect(getPublicApiBaseUrl()).toBe("https://api.example.test");
    expect(toPublicApiUrl("/api/public/posts")).toBe("https://api.example.test/api/public/posts");
    expect(toPublicAssetUrl("/api/files/webdav/foo.png")).toBe(
      "https://api.example.test/api/files/webdav/foo.png"
    );
  });

  it("keeps relative paths untouched when no public api base is configured", () => {
    delete process.env.PUBLIC_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;

    expect(getPublicApiBaseUrl()).toBe("");
    expect(toPublicApiUrl("/api/public/posts")).toBe("/api/public/posts");
    expect(toPublicAssetUrl("/images/foo.png")).toBe("/images/foo.png");
  });
});
