import { describe, expect, test } from "bun:test";
import { extractArticle, fetchArticleHtml, isPublicAddress, validateArticleUrl } from "./extract";

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
});
