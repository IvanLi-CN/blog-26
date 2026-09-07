import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type PublicMediaFetcher, packagePublicMedia } from "./package-public-media";
import { verifyPublicMediaPackage } from "./verify-public-media-package";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "public-media-package-"));
  temporaryRoots.push(root);
  await mkdir(join(root, "site-dist"), { recursive: true });
  return root;
}

function response(body: string, headers: Record<string, string> = {}) {
  return new Response(body, { status: 200, headers });
}

describe("packagePublicMedia", () => {
  test("does not include escaped JSON text after an embedded media URL", async () => {
    const cwd = await fixture();
    await writeFile(
      join(cwd, "site-dist", "index.html"),
      '<script type="application/json">{"body":"![diagram](/api/public/assets/post/hello/hash/content.webp)\\n\\n正文"}</script>'
    );

    const requestedUrls: string[] = [];
    await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      fetchImpl: async (input, init) => {
        requestedUrls.push(String(input));
        return response(init?.method === "HEAD" ? "" : "four", { "content-length": "4" });
      },
    });

    expect(requestedUrls).toEqual([
      "https://api.example/api/public/assets/post/hello/hash/content.webp",
      "https://api.example/api/public/assets/post/hello/hash/content.webp",
    ]);
    expect(await readFile(join(cwd, "site-dist", "index.html"), "utf8")).toContain(
      "/_content/assets/post/hello/hash/content.webp)\\n\\n正文"
    );
    await expect(
      verifyPublicMediaPackage({
        cwd,
        mediaOrigin: "https://api.example",
        siteBasePath: "/",
        maxFiles: 100,
        maxProjectBytes: 1024 * 1024,
      })
    ).resolves.toMatchObject({ fileCount: expect.any(Number) });
  });

  test("does not include HTML entities after an embedded media URL", async () => {
    const cwd = await fixture();
    await writeFile(
      join(cwd, "site-dist", "index.html"),
      '<script type="application/json">{"body":"![diagram](/api/public/assets/post/hello/hash/content.webp)&quot;],&quot;variant&quot;:[0,"article"]}</script>'
    );

    const requestedUrls: string[] = [];
    await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      fetchImpl: async (input, init) => {
        requestedUrls.push(String(input));
        return response(init?.method === "HEAD" ? "" : "four", { "content-length": "4" });
      },
    });

    expect(requestedUrls).toEqual([
      "https://api.example/api/public/assets/post/hello/hash/content.webp",
      "https://api.example/api/public/assets/post/hello/hash/content.webp",
    ]);
  });

  test("packages small facade assets and rewrites oversized assets to the backend origin", async () => {
    const cwd = await fixture();
    await writeFile(
      join(cwd, "site-dist", "index.html"),
      [
        '<img src="/api/public/assets/post/hello/hash/card.webp?v=1">',
        '<meta property="og:image" content="https://site.example/api/public/assets/post/hello/hash/cover.webp?v=1">',
      ].join("\n")
    );
    const calls: string[] = [];
    const fetchImpl: PublicMediaFetcher = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (init?.method === "HEAD" && url.includes("/cover.webp")) {
        return response("", { "content-length": "11" });
      }
      if (init?.method === "HEAD") return response("", { "content-length": "4" });
      if (url.includes("/cover.webp")) return response("oversized!!");
      return response("tiny", { "content-length": "4" });
    };

    const manifest = await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      maxBytes: 10,
      fetchImpl,
    });

    const html = await readFile(join(cwd, "site-dist", "index.html"), "utf8");
    expect(html).toContain("/_content/assets/post/hello/hash/card.webp?v=1");
    expect(html).toContain("https://api.example/api/public/assets/post/hello/hash/cover.webp?v=1");
    expect(manifest.packagedCount).toBe(1);
    expect(manifest.externalCount).toBe(1);
    expect(
      await readFile(join(cwd, "site-dist", "_content/assets/post/hello/hash/card.webp"), "utf8")
    ).toBe("tiny");
    expect(calls).toContain(
      "HEAD https://api.example/api/public/assets/post/hello/hash/card.webp?v=1"
    );
    expect(calls).not.toContain(
      "GET https://api.example/api/public/assets/post/hello/hash/cover.webp?v=1"
    );

    const result = await verifyPublicMediaPackage({
      cwd,
      mediaOrigin: "https://api.example",
      siteBasePath: "/",
      maxFiles: 100,
      maxProjectBytes: 1024 * 1024,
    });
    expect(result.fileCount).toBeGreaterThan(1);
  });

  test("rejects redirects that leave the configured media origin", async () => {
    const cwd = await fixture();
    await writeFile(
      join(cwd, "site-dist", "index.html"),
      '<img src="/api/public/assets/post/redirect/hash/card.webp">'
    );

    await expect(
      packagePublicMedia({
        cwd,
        mediaOrigin: "https://api.example",
        siteUrl: "https://site.example",
        fetchImpl: async (_input, _init) =>
          new Response(null, {
            status: 302,
            headers: { location: "https://metadata.example/latest" },
          }),
      })
    ).rejects.toThrow("escaped the configured origin");
  });

  test("preserves unrelated generated content under _content", async () => {
    const cwd = await fixture();
    await mkdir(join(cwd, "site-dist", "_content"), { recursive: true });
    await writeFile(join(cwd, "site-dist", "_content", "keep.json"), '{"keep":true}\n');
    await writeFile(
      join(cwd, "site-dist", "index.html"),
      '<img src="/api/public/assets/post/keep/hash/card.webp">'
    );

    await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      fetchImpl: async () => response("four", { "content-length": "4" }),
    });

    expect(await readFile(join(cwd, "site-dist", "_content", "keep.json"), "utf8")).toBe(
      '{"keep":true}\n'
    );
    expect((await stat(join(cwd, "site-dist", "_content", "media-manifest.json"))).isFile()).toBe(
      true
    );
  });

  test("fails closed when a referenced media asset cannot be downloaded", async () => {
    const cwd = await fixture();
    await writeFile(
      join(cwd, "site-dist", "index.html"),
      '<img src="/api/public/assets/post/missing/hash/card.webp">'
    );

    await expect(
      packagePublicMedia({
        cwd,
        mediaOrigin: "https://api.example",
        siteUrl: "https://site.example",
        fetchImpl: async (_input, init) =>
          new Response("missing", { status: init?.method === "HEAD" ? 404 : 404 }),
      })
    ).rejects.toThrow("HTTP 404");
  });

  test("falls back to GET when the media origin rejects HEAD", async () => {
    const cwd = await fixture();
    await writeFile(
      join(cwd, "site-dist", "index.html"),
      '<img src="/api/public/assets/memo/animated/hash/content.webp">'
    );

    const methods: string[] = [];
    await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      fetchImpl: async (_input, init) => {
        methods.push(init?.method ?? "GET");
        if (init?.method === "HEAD") {
          return new Response('{"message":"maximum resolution exceeded"}', { status: 422 });
        }
        return response("animated-derivative", { "content-length": "18" });
      },
    });

    expect(methods).toEqual(["HEAD", "GET"]);
    expect(
      await readFile(
        join(cwd, "site-dist", "_content/assets/memo/animated/hash/content.webp"),
        "utf8"
      )
    ).toBe("animated-derivative");
  });

  test("packages an asset exactly at the limit and preserves a site base path", async () => {
    const cwd = await fixture();
    await writeFile(
      join(cwd, "site-dist", "index.html"),
      '<img src="/api/public/assets/post/exact/hash/card.webp">'
    );

    await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example/blog",
      siteBasePath: "/blog/",
      maxBytes: 4,
      fetchImpl: async () => response("four", { "content-length": "4" }),
    });

    const html = await readFile(join(cwd, "site-dist", "index.html"), "utf8");
    expect(html).toContain("/blog/_content/assets/post/exact/hash/card.webp");
    expect(
      await readFile(join(cwd, "site-dist", "_content/assets/post/exact/hash/card.webp"), "utf8")
    ).toBe("four");
  });

  test("downloads referenced media with bounded concurrency", async () => {
    const cwd = await fixture();
    const references = Array.from(
      { length: 10 },
      (_, index) => `/api/public/assets/post/concurrent/hash${index}/card.webp`
    );
    await writeFile(join(cwd, "site-dist", "index.html"), references.join("\n"));

    let active = 0;
    let maximumActive = 0;
    await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      downloadConcurrency: 2,
      fetchImpl: async (_input, init) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return response(init?.method === "HEAD" ? "" : "four", {
          "content-length": init?.method === "HEAD" ? "4" : "4",
        });
      },
    });

    expect(maximumActive).toBeGreaterThan(1);
    expect(maximumActive).toBeLessThanOrEqual(2);
  });

  test("fails with the media URL when a request exceeds its timeout", async () => {
    const cwd = await fixture();
    const mediaPath = "/api/public/assets/post/timeout/hash/card.webp";
    await writeFile(join(cwd, "site-dist", "index.html"), `<img src="${mediaPath}">`);

    await expect(
      packagePublicMedia({
        cwd,
        mediaOrigin: "https://api.example",
        siteUrl: "https://site.example",
        requestTimeoutMs: 5,
        fetchImpl: async (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
              once: true,
            });
          }),
      })
    ).rejects.toThrow(
      "Media origin request timed out after 5 ms: https://api.example/api/public/assets/post/timeout/hash/card.webp"
    );
  });

  test("fails when a media response body exceeds its timeout", async () => {
    const cwd = await fixture();
    const mediaPath = "/api/public/assets/post/timeout-body/hash/card.webp";
    await writeFile(join(cwd, "site-dist", "index.html"), `<img src="${mediaPath}">`);

    await expect(
      packagePublicMedia({
        cwd,
        mediaOrigin: "https://api.example",
        siteUrl: "https://site.example",
        requestTimeoutMs: 5,
        fetchImpl: async (_input, init) => {
          if (init?.method === "HEAD") return response("", { "content-length": "4" });
          return new Response(
            new ReadableStream<Uint8Array>({
              start: () => undefined,
            }),
            { status: 200 }
          );
        },
      })
    ).rejects.toThrow(
      "Media origin response body timed out after 5 ms: https://api.example/api/public/assets/post/timeout-body/hash/card.webp"
    );
  });

  test("retries transient media response body failures", async () => {
    const cwd = await fixture();
    const mediaPath = "/api/public/assets/post/retry/hash/card.webp";
    await writeFile(join(cwd, "site-dist", "index.html"), `<img src="${mediaPath}">`);

    let getAttempts = 0;
    await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      downloadAttempts: 2,
      fetchImpl: async (_input, init) => {
        if (init?.method === "HEAD") return response("", { "content-length": "4" });
        getAttempts += 1;
        if (getAttempts === 1) {
          return new Response(
            new ReadableStream<Uint8Array>({
              start: (controller) => controller.error(new Error("socket reset")),
            }),
            { status: 200 }
          );
        }
        return response("four", { "content-length": "4" });
      },
    });

    expect(getAttempts).toBe(2);
    expect(
      await readFile(join(cwd, "site-dist", "_content/assets/post/retry/hash/card.webp"), "utf8")
    ).toBe("four");
  });

  test("fails when the manifest and packaged static files drift", async () => {
    const cwd = await fixture();
    await writeFile(
      join(cwd, "site-dist", "index.html"),
      '<img src="/api/public/assets/post/drift/hash/card.webp">'
    );

    await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      fetchImpl: async () => response("four", { "content-length": "4" }),
    });

    const manifestPath = join(cwd, "site-dist", "_content/media-manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      packagedCount: number;
    };
    manifest.packagedCount = 0;
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);

    await expect(
      verifyPublicMediaPackage({
        cwd,
        mediaOrigin: "https://api.example",
        maxFiles: 100,
        maxProjectBytes: 1024 * 1024,
      })
    ).rejects.toThrow("packagedCount");
  });

  test("rejects malformed manifest entries", async () => {
    const cwd = await fixture();
    await mkdir(join(cwd, "site-dist", "_content"), { recursive: true });
    await writeFile(
      join(cwd, "site-dist", "_content", "media-manifest.json"),
      JSON.stringify({
        schemaVersion: 1,
        maxBytes: 10,
        entries: [{ sourcePath: "/api/public/assets/x", outputPath: null, bytes: -1 }],
        packagedCount: 0,
        packagedBytes: 0,
        externalCount: 0,
      })
    );

    await expect(
      verifyPublicMediaPackage({
        cwd,
        mediaOrigin: "https://api.example",
        maxFiles: 100,
        maxProjectBytes: 1024 * 1024,
      })
    ).rejects.toThrow("Invalid public media manifest entry");
  });
});
