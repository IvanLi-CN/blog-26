import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  extractArticle,
  fetchArticle,
  fetchArticleHtml,
  isPublicAddress,
  validateArticleUrl,
} from "./extract";

describe("clipping fetch security", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "172.31.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "192.0.2.1",
    "198.18.0.1",
    "224.0.0.1",
    "::1",
    "::",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
    "3fff::1",
    "64:ff9b::a00:1",
    "2002:a00:1::1",
    "4000::1",
  ]) {
    test(`rejects ${address}`, () => expect(isPublicAddress(address)).toBe(false));
  }
  test("accepts public addresses and normalizes numeric IPv4 before checking", () => {
    expect(isPublicAddress("1.1.1.1")).toBe(true);
    expect(isPublicAddress("2606:4700::1111")).toBe(true);
    for (const url of [
      "http://2130706433",
      "http://0x7f000001",
      "http://127.1",
      "http://[::ffff:127.0.0.1]",
      "file:///etc/passwd",
      "https://user:secret@example.com",
    ])
      expect(() => validateArticleUrl(url)).toThrow();
  });
  test("rejects mixed DNS responses without issuing a request", async () => {
    let requests = 0;
    await expect(
      fetchArticleHtml("https://article.example/", {
        dependencies: {
          resolve: async () => [
            { address: "1.1.1.1", family: 4 },
            { address: "127.0.0.1", family: 4 },
          ],
          request: async () => {
            requests++;
            throw new Error("unreachable");
          },
        },
      })
    ).rejects.toThrow("非公网");
    expect(requests).toBe(0);
  });
  test("rechecks DNS after every redirect and fixes the selected destination", async () => {
    let lookups = 0;
    let requests = 0;
    await expect(
      fetchArticleHtml("https://article.example/", {
        dependencies: {
          resolve: async () => [{ address: ++lookups === 1 ? "1.1.1.1" : "10.0.0.1", family: 4 }],
          request: async (url, destination) => {
            expect(url.hostname).toBe("article.example");
            expect(destination.address).toBe("1.1.1.1");
            requests++;
            return { status: 302, location: "/changed", body: Buffer.alloc(0) };
          },
        },
      })
    ).rejects.toThrow("非公网");
    expect(lookups).toBe(2);
    expect(requests).toBe(1);
  });
  test("rejects a private redirect and caps public redirects", async () => {
    let requests = 0;
    const resolve = async () => [{ address: "1.1.1.1", family: 4 }];
    await expect(
      fetchArticleHtml("https://article.example/", {
        dependencies: {
          resolve,
          request: async () => ({ status: 302, location: "http://[::1]/", body: Buffer.alloc(0) }),
        },
      })
    ).rejects.toThrow("非公网");
    await expect(
      fetchArticleHtml("https://article.example/", {
        dependencies: {
          resolve,
          request: async () => {
            requests++;
            return { status: 302, location: "/again", body: Buffer.alloc(0) };
          },
        },
      })
    ).rejects.toThrow("跳转次数");
    expect(requests).toBe(6);
  });
  test("bounds decoded size and includes DNS in the total timeout", async () => {
    await expect(
      fetchArticleHtml("https://article.example/", {
        maxBytes: 10,
        dependencies: {
          resolve: async () => [{ address: "1.1.1.1", family: 4 }],
          request: async () => ({ status: 200, body: Buffer.alloc(11) }),
        },
      })
    ).rejects.toThrow("大小限制");
    await expect(
      fetchArticleHtml("https://article.example/", {
        timeoutMs: 10,
        dependencies: {
          resolve: () =>
            new Promise(() => {
              /* Deliberately stalled DNS fixture. */
            }),
        },
      })
    ).rejects.toThrow("超时");
  });
});

describe("article extraction", () => {
  const prose =
    "A durable agent stores its progress so that a restart can recover the conversation. ".repeat(
      25
    );
  test("keeps headings, tables, links and code without executing scripts or fetching assets", () => {
    const article = extractArticle(
      Buffer.from(
        `<html><title>Durable agents</title><body><nav>Navigation</nav><article><h1>Durable agents</h1><p>${prose}</p><h2>Recovery</h2><p>${prose}<a href="/notes">Notes</a></p><table><tr><th>Step</th><th>Result</th></tr><tr><td>Restart</td><td>Resume</td></tr></table><pre><code class="language-ts">const x = 1;\nconsole.log(x);</code></pre><a href="javascript:alert(1)">Unsafe</a><img src="http://127.0.0.1/private" onerror="alert(1)"><script>throw new Error("must not execute")</script></article></body></html>`
      ),
      "https://article.example/page"
    );
    expect(article.markdown).toContain("## Recovery");
    expect(article.markdown).toContain("https://article.example/notes");
    expect(article.markdown).toContain("| Step | Result |");
    expect(article.markdown).toContain("```ts\nconst x = 1;");
    expect(article.markdown).not.toContain("127.0.0.1");
    expect(article.markdown).not.toContain("javascript:");
    expect(article.markdown).not.toContain("must not execute");
    expect(article.warning).toBeNull();
  });
  test("fails on empty/navigation pages and flags a likely paywall", () => {
    expect(() =>
      extractArticle(Buffer.from("<html><nav>Home</nav></html>"), "https://article.example")
    ).toThrow("正文");
    const article = extractArticle(
      Buffer.from(
        `<article><h1>Example</h1><p>${prose}</p><p>Subscribe to read the remaining article.</p></article>`
      ),
      "https://article.example"
    );
    expect(article.warning).toContain("部分正文");
  });

  test("downloads article media with the article referer and rewrites every responsive candidate", async () => {
    const requests: Array<{ url: string; referer?: string }> = [];
    const article = await fetchArticle("https://article.example/page?token=secret#section", {
      dependencies: {
        resolve: async () => [{ address: "1.1.1.1", family: 4 }],
        request: async (url, _destination, _signal, _limit, options) => {
          requests.push({ url: url.href, referer: options?.referer });
          if (url.pathname === "/page")
            return {
              status: 200,
              contentType: "text/html; charset=utf-8",
              body: Buffer.from(
                `<article><h1>Media article</h1><p>${prose}</p><picture><source srcset="/hero.webp 1x, /hero@2x.webp 2x"><img src="/hero.webp" alt="Hero"></picture><video poster="/poster.jpg" src="/movie.mp4"></video></article>`
              ),
            };
          const bodies: Record<string, { contentType: string; body: Buffer }> = {
            "/hero.webp": { contentType: "image/webp", body: Buffer.from("hero") },
            "/hero@2x.webp": { contentType: "image/webp", body: Buffer.from("hero2") },
            "/poster.jpg": { contentType: "image/jpeg", body: Buffer.from("poster") },
            "/movie.mp4": { contentType: "video/mp4", body: Buffer.from("movie") },
          };
          const media = bodies[url.pathname];
          if (!media) return { status: 404, body: Buffer.alloc(0) };
          return { status: 200, ...media };
        },
      },
    });

    expect(article.resources).toHaveLength(4);
    expect(article.resources?.every((resource) => resource.status === "captured")).toBe(true);
    expect(article.markdown).toMatch(/\.\/assets\/[a-f0-9]{64}\.webp/u);
    expect(article.markdown).toContain("./assets/");
    for (const resource of article.resources ?? [])
      if (resource.path) expect(article.markdown).toContain(`./${resource.path}`);
    expect(
      article.resources?.find((resource) => resource.originalUrl.endsWith("/hero.webp"))?.id
    ).toBe(createHash("sha256").update("hero").digest("hex"));
    expect(
      requests.slice(1).every((request) => request.referer === "https://article.example/page")
    ).toBe(true);
  });

  test("preserves responsive candidates from standalone images", async () => {
    const article = await fetchArticle("https://article.example/page", {
      dependencies: {
        resolve: async () => [{ address: "1.1.1.1", family: 4 }],
        request: async (url) =>
          url.pathname === "/page"
            ? {
                status: 200,
                contentType: "text/html",
                body: Buffer.from(
                  `<article><h1>Responsive image</h1><p>${prose}</p><img src="/one.png" srcset="/two.png 2x"></article>`
                ),
              }
            : {
                status: 200,
                contentType: "image/png",
                body: Buffer.from(url.pathname === "/one.png" ? "one" : "two"),
              },
      },
    });

    expect(article.resources).toHaveLength(2);
    expect(article.markdown).toContain("<img");
    expect(article.markdown.match(/\.\/assets\/[a-f0-9]{64}\.png/gu)).toHaveLength(2);
  });

  test("uses a safe extension derived from the validated MIME type", async () => {
    const article = await fetchArticle("https://article.example/page", {
      dependencies: {
        resolve: async () => [{ address: "1.1.1.1", family: 4 }],
        request: async (url) =>
          url.pathname === "/page"
            ? {
                status: 200,
                contentType: "text/html",
                body: Buffer.from(
                  `<article><h1>Audio</h1><p>${prose}</p><audio src="/download.html"></audio><video src="/film.html"></video></article>`
                ),
              }
            : {
                status: 200,
                contentType: url.pathname === "/film.html" ? "video/mpeg" : "audio/mp4",
                body: Buffer.from(url.pathname === "/film.html" ? "film" : "audio"),
              },
      },
    });

    expect(article.resources).toHaveLength(2);
    expect(article.resources?.map((resource) => resource.path)).toEqual(
      expect.arrayContaining([expect.stringMatching(/\.mp4$/u), expect.stringMatching(/\.mpeg$/u)])
    );
    expect(article.resources?.every((resource) => !resource.path?.endsWith(".html"))).toBe(true);
  });

  test("isolates transient resource failures and infers safe MIME types from extensions", async () => {
    const article = await fetchArticle("https://article.example/page", {
      dependencies: {
        resolve: async () => [{ address: "1.1.1.1", family: 4 }],
        request: async (url) =>
          url.pathname === "/page"
            ? {
                status: 200,
                contentType: "text/html",
                body: Buffer.from(
                  `<article><h1>Resilient media</h1><p>${prose}</p><img src="/hero.apng"><video src="/movie.mpeg"><source src="/missing.mp4"></video></article>`
                ),
              }
            : url.pathname === "/hero.apng"
              ? {
                  status: 200,
                  contentType: "application/octet-stream",
                  body: Buffer.from("apng"),
                }
              : url.pathname === "/movie.mpeg"
                ? { status: 503, body: Buffer.alloc(0) }
                : { status: 404, body: Buffer.alloc(0) },
      },
    });

    expect(
      article.resources?.find((resource) => resource.originalUrl.endsWith("/hero.apng"))
    ).toMatchObject({
      path: expect.stringMatching(/\.apng$/u),
      mimeType: "image/apng",
      status: "captured",
    });
    expect(
      article.resources?.find((resource) => resource.originalUrl.endsWith("/movie.mpeg"))
    ).toMatchObject({
      status: "failed",
    });
    expect(article.markdown).toContain("资源抓取失败：视频");
  });

  test("retries transient resource failures before recording a placeholder", async () => {
    let attempts = 0;
    const article = await fetchArticle("https://article.example/page", {
      dependencies: {
        resolve: async () => [{ address: "1.1.1.1", family: 4 }],
        request: async (url) =>
          url.pathname === "/page"
            ? {
                status: 200,
                contentType: "text/html",
                body: Buffer.from(
                  `<article><h1>Retry media</h1><p>${prose}</p><img src="/flaky.png"></article>`
                ),
              }
            : attempts++ === 0
              ? { status: 503, body: Buffer.alloc(0) }
              : { status: 200, contentType: "image/png", body: Buffer.from("recovered") },
      },
    });

    expect(attempts).toBe(2);
    expect(article.resources?.[0]).toMatchObject({ status: "captured", mimeType: "image/png" });
    expect(article.markdown).toMatch(/\.\/assets\/[a-f0-9]{64}\.png/u);
  });

  test("rejects active or unknown media formats and removes failed tracks", async () => {
    const article = await fetchArticle("https://article.example/page", {
      dependencies: {
        resolve: async () => [{ address: "1.1.1.1", family: 4 }],
        request: async (url) =>
          url.pathname === "/page"
            ? {
                status: 200,
                contentType: "text/html",
                body: Buffer.from(
                  `<article><h1>Unsafe media</h1><p>${prose}</p><img alt="diagram" src="/diagram.svg"><video><track src="/captions.vtt"></video></article>`
                ),
              }
            : url.pathname === "/diagram.svg"
              ? { status: 200, contentType: "image/svg+xml", body: Buffer.from("<svg/>") }
              : { status: 200, contentType: "text/vtt", body: Buffer.from("WEBVTT") },
      },
    });

    expect(article.resources).toHaveLength(2);
    expect(article.resources?.every((resource) => resource.status === "failed")).toBe(true);
    expect(article.markdown).toContain("资源抓取失败：diagram");
    expect(article.markdown).toContain("资源抓取失败：视频");
    expect(article.markdown).not.toContain("captions.vtt");
    expect(article.markdown).not.toContain("diagram.svg");
  });

  test("passes the remaining total budget to later resource requests", async () => {
    const requests: string[] = [];
    const article = await fetchArticle("https://article.example/page", {
      maxResourceTotalBytes: 4,
      dependencies: {
        resolve: async () => [{ address: "1.1.1.1", family: 4 }],
        request: async (url) => {
          requests.push(url.pathname);
          return url.pathname === "/page"
            ? {
                status: 200,
                contentType: "text/html",
                body: Buffer.from(
                  `<article><h1>Budgeted media</h1><p>${prose}</p><img src="/one.png"><img src="/two.png"></article>`
                ),
              }
            : { status: 200, contentType: "image/png", body: Buffer.from("1234") };
        },
      },
    });

    expect(requests.filter((path) => path !== "/page")).toHaveLength(1);
    expect(article.resources?.filter((resource) => resource.status === "captured")).toHaveLength(1);
    expect(article.resources?.filter((resource) => resource.status === "failed")).toHaveLength(1);
  });

  test("charges failed resource attempts against the shared budget", async () => {
    const requests: string[] = [];
    const article = await fetchArticle("https://article.example/page", {
      maxResourceBytes: 4,
      maxResourceTotalBytes: 8,
      dependencies: {
        resolve: async () => [{ address: "1.1.1.1", family: 4 }],
        request: async (url) => {
          requests.push(url.pathname);
          return url.pathname === "/page"
            ? {
                status: 200,
                contentType: "text/html",
                body: Buffer.from(
                  `<article><h1>Failed resources</h1><p>${prose}</p><img src="/one.png"><img src="/two.png"><img src="/three.png"></article>`
                ),
              }
            : { status: 200, contentType: "image/png", body: Buffer.alloc(5) };
        },
      },
    });

    expect(requests.filter((path) => path !== "/page")).toHaveLength(2);
    expect(article.resources?.every((resource) => resource.status === "failed")).toBe(true);
  });

  test("removes failed media URLs and leaves an explicit placeholder", async () => {
    const article = await fetchArticle("https://article.example/page", {
      dependencies: {
        resolve: async () => [{ address: "1.1.1.1", family: 4 }],
        request: async (url) =>
          url.pathname === "/page"
            ? {
                status: 200,
                contentType: "text/html",
                body: Buffer.from(
                  `<article><h1>Broken media</h1><p>${prose}</p><img src="/missing.png" alt="Missing chart https://cdn.example/missing.png"><video><source src="/missing.mp4"></video></article>`
                ),
              }
            : { status: 404, body: Buffer.alloc(0) },
      },
    });

    expect(article.resources).toHaveLength(2);
    expect(article.resources?.every((resource) => resource.status === "failed")).toBe(true);
    expect(article.markdown).toContain("资源抓取失败：Missing chart");
    expect(article.markdown).toContain("资源抓取失败：视频");
    expect(article.markdown).not.toContain("missing.png");
    expect(article.markdown).not.toContain("cdn.example");
    expect(article.warning).toContain("2 个正文资源");
  });
});
