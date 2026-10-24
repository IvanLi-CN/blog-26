import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  DEFAULT_MAX_HEADER_BYTES,
  fetchPublicResourceOverHttp11,
  type PublicHttp11Spawner,
  type PublicMediaFetcher,
  packagePublicMedia,
} from "./package-public-media";
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

function fakeCurlSpawner({
  body,
  stderr = "",
  exitCode = 0,
  headers,
  onKill,
  onSpawn,
  stdoutChunks,
  holdExit = false,
}: {
  body: string;
  stderr?: string;
  exitCode?: number;
  headers: string;
  onKill?: () => void;
  onSpawn?: (args: string[], options: Parameters<PublicHttp11Spawner>[1]) => void;
  stdoutChunks?: string[];
  holdExit?: boolean;
}): PublicHttp11Spawner {
  return (args, options) => {
    onSpawn?.(args, options);
    if (!args.includes("--include")) throw new Error("fake curl did not include response headers");
    const stdout = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of stdoutChunks ?? [`${headers}${body}`]) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });
    const stderrStream = new Response(stderr).body;
    if (!stdout || !stderrStream) throw new Error("fake curl streams were not created");
    let releaseExit: ((code: number) => void) | undefined;
    const exited = new Promise<number>((resolve) => {
      releaseExit = resolve;
    });
    if (!holdExit) releaseExit?.(exitCode);
    return {
      stdout,
      stderr: stderrStream,
      exited,
      kill: () => {
        onKill?.();
        releaseExit?.(exitCode);
      },
    };
  };
}

describe("packagePublicMedia", () => {
  test("parses successful responses from the HTTP/1.1 process adapter", async () => {
    let curlArgs: string[] = [];
    const response = await fetchPublicResourceOverHttp11(
      "https://api.example/resource",
      {},
      1_000,
      undefined,
      fakeCurlSpawner({
        body: "four",
        headers: "HTTP/1.1 200 OK\r\ncontent-length: 4\r\n\r\n",
        onSpawn: (args) => {
          curlArgs = args;
        },
      })
    );

    expect(curlArgs).toContain("--disable");
    expect(curlArgs).toContain("--globoff");
    expect(curlArgs).toContain("--include");
    expect(curlArgs).toContain("--raw");
    expect(curlArgs).toContain("--suppress-connect-headers");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("four");
  });

  test("parses interim headers and body data across stdout chunks", async () => {
    const response = await fetchPublicResourceOverHttp11(
      "https://api.example/resource",
      {},
      1_000,
      undefined,
      fakeCurlSpawner({
        body: "",
        headers: "",
        stdoutChunks: [
          "HTTP/1.1 100 Continue\r\n",
          "\r\nHTTP/1.1 200 OK\r\ncontent-length: 4\r\n",
          "\r\nfo",
          "ur",
        ],
      })
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("four");
  });

  test("strips chunked response trailers from the media body", async () => {
    const response = await fetchPublicResourceOverHttp11(
      "https://api.example/resource",
      {},
      1_000,
      undefined,
      fakeCurlSpawner({
        body: "",
        headers: "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n",
        stdoutChunks: [
          "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n",
          "4\r\nfour\r\n",
          "0\r\nX-Checksum: abc\r\n\r\n",
        ],
      })
    );

    expect(await response.text()).toBe("four");
  });

  test("rejects fallback responses with unsupported content encoding", async () => {
    await expect(
      fetchPublicResourceOverHttp11(
        "https://api.example/resource",
        {},
        1_000,
        undefined,
        fakeCurlSpawner({
          body: "compressed",
          headers: "HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\n\r\n",
        })
      )
    ).rejects.toThrow("unsupported content encoding");
  });

  test("rejects folded fallback response headers", async () => {
    await expect(
      fetchPublicResourceOverHttp11(
        "https://api.example/resource",
        {},
        1_000,
        undefined,
        fakeCurlSpawner({
          body: "compressed",
          headers: "HTTP/1.1 200 OK\r\nContent-Encoding:\r\n gzip\r\n\r\n",
        })
      )
    ).rejects.toThrow("folded response header");
  });

  test("rejects fallback responses with unsupported transfer encoding", async () => {
    await expect(
      fetchPublicResourceOverHttp11(
        "https://api.example/resource",
        {},
        1_000,
        undefined,
        fakeCurlSpawner({
          body: "compressed",
          headers: "HTTP/1.1 200 OK\r\nTransfer-Encoding: gzip\r\n\r\n",
        })
      )
    ).rejects.toThrow("unsupported transfer encoding");
  });

  test("rejects conflicting transfer and content length headers", async () => {
    await expect(
      fetchPublicResourceOverHttp11(
        "https://api.example/resource",
        {},
        1_000,
        4,
        fakeCurlSpawner({
          body: "",
          headers: "",
          stdoutChunks: [
            "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\ncontent-length: 999\r\n\r\n",
            "0\r\n\r\n",
          ],
        })
      )
    ).rejects.toThrow("conflicting response framing headers");
  });

  test("preserves no-body HTTP status semantics", async () => {
    for (const status of [204, 205, 304]) {
      const response = await fetchPublicResourceOverHttp11(
        "https://api.example/resource",
        {},
        1_000,
        undefined,
        fakeCurlSpawner({
          body: "",
          headers: `HTTP/1.1 ${status} No Content\r\ncontent-length: 9\r\n\r\n`,
        })
      );

      expect(response.status).toBe(status);
      expect(response.headers.get("content-length")).toBeNull();
      expect(await response.arrayBuffer()).toHaveLength(0);
    }
  });

  test("kills the HTTP/1.1 process when the response exceeds the limit", async () => {
    let killed = false;
    const response = await fetchPublicResourceOverHttp11(
      "https://api.example/resource",
      {},
      1_000,
      4,
      fakeCurlSpawner({
        body: "",
        headers: "",
        stdoutChunks: ["HTTP/1.1 200 OK\r\ncontent-length: 5\r\n\r\nfi", "ve!"],
        onKill: () => {
          killed = true;
        },
      })
    );

    expect(killed).toBe(true);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("5");
    expect(await response.arrayBuffer()).toHaveLength(0);
  });

  test("preserves HTTP/1.1 process diagnostics on non-zero exit", async () => {
    await expect(
      fetchPublicResourceOverHttp11(
        "https://api.example/resource",
        {},
        1_000,
        undefined,
        fakeCurlSpawner({
          body: "",
          stderr: "curl: (6) Could not resolve host",
          exitCode: 6,
          headers: "",
        })
      )
    ).rejects.toThrow("curl: (6) Could not resolve host");
  });

  test("preserves curl diagnostics when the response body is truncated", async () => {
    await expect(
      fetchPublicResourceOverHttp11(
        "https://api.example/resource",
        {},
        1_000,
        undefined,
        fakeCurlSpawner({
          body: "four",
          headers: "HTTP/1.1 200 OK\r\ncontent-length: 5\r\n\r\n",
          stderr: "curl: (18) end of response with 1 bytes missing",
          exitCode: 18,
        })
      )
    ).rejects.toThrow("curl: (18) end of response with 1 bytes missing");
  });

  test("rejects an HTTP/1.1 fallback before spawning when already aborted", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled before spawn");
    controller.abort(reason);
    let spawned = false;

    await expect(
      fetchPublicResourceOverHttp11(
        "https://api.example/resource",
        { signal: controller.signal },
        1_000,
        undefined,
        ((..._args) => {
          spawned = true;
          throw new Error("curl should not spawn");
        }) as PublicHttp11Spawner
      )
    ).rejects.toBe(reason);
    expect(spawned).toBe(false);
  });

  test("kills an HTTP/1.1 fallback when its signal aborts during streaming", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled during stream");
    let killed = false;
    let releaseExit: ((code: number) => void) | undefined;
    const spawner: PublicHttp11Spawner = () => {
      const stderr = new Response("").body;
      if (!stderr) throw new Error("fake curl stderr stream was not created");
      return {
        stdout: new ReadableStream<Uint8Array>({
          start() {
            // Keep stdout open until the abort signal kills the fake process.
          },
        }),
        stderr,
        exited: new Promise<number>((resolve) => {
          releaseExit = resolve;
        }),
        kill: () => {
          killed = true;
          releaseExit?.(143);
        },
      };
    };

    const pending = fetchPublicResourceOverHttp11(
      "https://api.example/resource",
      { signal: controller.signal },
      1_000,
      undefined,
      spawner
    );
    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
    expect(killed).toBe(true);
  });

  test("bounds response-header storage and kills curl while headers grow", async () => {
    let killed = false;
    await expect(
      fetchPublicResourceOverHttp11(
        "https://api.example/resource",
        {},
        1_000,
        undefined,
        fakeCurlSpawner({
          body: "",
          headers: "",
          stdoutChunks: [
            `HTTP/1.1 200 OK\r\nX-Large: ${"x".repeat(DEFAULT_MAX_HEADER_BYTES - 32)}`,
            "xxxxxxxxxxxxxxxx",
          ],
          holdExit: true,
          onKill: () => {
            killed = true;
          },
        })
      )
    ).rejects.toThrow(
      `HTTP/1.1 public resource fallback response headers exceed ${DEFAULT_MAX_HEADER_BYTES} bytes`
    );
    expect(killed).toBe(true);
  });

  test("bounds chunked response trailers with the header limit", async () => {
    let killed = false;
    await expect(
      fetchPublicResourceOverHttp11(
        "https://api.example/resource",
        {},
        1_000,
        undefined,
        fakeCurlSpawner({
          body: "",
          headers: "",
          stdoutChunks: [
            "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n",
            `0\r\nX-Large: ${"x".repeat(DEFAULT_MAX_HEADER_BYTES)}\r\n\r\n`,
          ],
          holdExit: true,
          onKill: () => {
            killed = true;
          },
        })
      )
    ).rejects.toThrow(
      `HTTP/1.1 public resource fallback response headers exceed ${DEFAULT_MAX_HEADER_BYTES} bytes`
    );
    expect(killed).toBe(true);
  });

  test("does not pass deployment credentials to curl", async () => {
    const previousToken = process.env.PLAYBOOK_SOURCE_TOKEN;
    process.env.PLAYBOOK_SOURCE_TOKEN = "test-token";
    let childEnv: Parameters<PublicHttp11Spawner>[1]["env"] | undefined;
    try {
      await fetchPublicResourceOverHttp11(
        "https://api.example/resource",
        {},
        1_000,
        undefined,
        fakeCurlSpawner({
          body: "four",
          headers: "HTTP/1.1 200 OK\r\ncontent-length: 4\r\n\r\n",
          onSpawn: (_args, options) => {
            childEnv = options.env;
          },
        })
      );
    } finally {
      if (previousToken === undefined) delete process.env.PLAYBOOK_SOURCE_TOKEN;
      else process.env.PLAYBOOK_SOURCE_TOKEN = previousToken;
    }
    expect(childEnv?.PLAYBOOK_SOURCE_TOKEN).toBeUndefined();
  });

  test("packages clipping version resources and does not leave oversized resources external", async () => {
    const cwd = await fixture();
    const filename = `${"a".repeat(64)}.png`;
    const resourceBaseUrl = "/api/public/memos/clip/clipping/assets/version-1/";
    const candidateUrl = `/api/public/memos/clip/clipping/assets/version-1/${filename}`;
    await writeFile(
      join(cwd, "site-dist", "index.html"),
      `<script>const resourceBaseUrl = "${resourceBaseUrl}";</script><img src="${candidateUrl}">`
    );

    const requestedUrls: string[] = [];
    const manifest = await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      fetchImpl: async (input) => {
        requestedUrls.push(String(input));
        return response("captured image");
      },
    });

    expect(requestedUrls).toEqual([`https://api.example${candidateUrl}`]);
    expect(manifest).toMatchObject({ packagedCount: 1, externalCount: 0 });
    expect(await readFile(join(cwd, "site-dist", "index.html"), "utf8")).toContain(
      `/_content/assets/memos/clip/clipping/assets/version-1/${filename}`
    );
    expect(await readFile(join(cwd, "site-dist", "index.html"), "utf8")).toContain(
      "/_content/assets/memos/clip/clipping/assets/version-1/"
    );
    await expect(
      verifyPublicMediaPackage({
        cwd,
        mediaOrigin: "https://api.example",
        maxFiles: 100,
        maxProjectBytes: 1024 * 1024,
      })
    ).resolves.toMatchObject({ fileCount: expect.any(Number) });

    await writeFile(join(cwd, "site-dist", "index.html"), `<img src="${candidateUrl}">`);
    await expect(
      packagePublicMedia({
        cwd,
        mediaOrigin: "https://api.example",
        siteUrl: "https://site.example",
        maxBytes: 3,
        fetchImpl: async () => response("too large"),
      })
    ).rejects.toThrow("Required clipping resource");
  });

  test("freezes clipping resources discovered from snapshot-relative references", async () => {
    const cwd = await fixture();
    const filename = `${"b".repeat(64)}.webp`;
    const candidateUrl = `/api/public/memos/clip/clipping/assets/version-1/${filename}`;
    await writeFile(
      join(cwd, "site-dist", "snapshot.json"),
      JSON.stringify({
        resourceBaseUrl: "/api/public/memos/clip/clipping/assets/version-1/",
        source: `![Asset](./assets/${filename})`,
      })
    );

    const requestedUrls: string[] = [];
    const manifest = await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      clippingResourceUrls: [`https://api.example${candidateUrl}`],
      fetchImpl: async (input) => {
        requestedUrls.push(String(input));
        return response("captured image");
      },
    });

    expect(requestedUrls).toEqual([`https://api.example${candidateUrl}`]);
    expect(manifest.entries).toContainEqual(
      expect.objectContaining({
        sourcePath: candidateUrl,
        status: "packaged",
      })
    );
  });

  test("preserves immutable Playbook edition files when page media URLs match", async () => {
    const cwd = await fixture();
    const candidateUrl = "/api/public/assets/post/candidate/hash/cover.webp";
    const editionDirectory = join(
      cwd,
      "site-dist",
      "_content",
      "playbook",
      "v3.0.0",
      "a".repeat(64)
    );
    const snapshotPath = join(editionDirectory, "public-snapshot.json");
    const catalogPath = join(editionDirectory, "catalog.json");
    const snapshot = JSON.stringify({ media: { sources: [{ url: candidateUrl }] } });
    const catalog = JSON.stringify({ content: `![image](${candidateUrl})` });
    await mkdir(editionDirectory, { recursive: true });
    await writeFile(snapshotPath, snapshot);
    await writeFile(catalogPath, catalog);
    await writeFile(join(cwd, "site-dist", "index.html"), `<img src="${candidateUrl}">`);

    const requestedUrls: string[] = [];
    await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      fetchImpl: async (input) => {
        requestedUrls.push(String(input));
        return response("image");
      },
    });

    expect(requestedUrls).toEqual([`https://api.example${candidateUrl}`]);
    expect(await readFile(snapshotPath, "utf8")).toBe(snapshot);
    expect(await readFile(catalogPath, "utf8")).toBe(catalog);
    expect(await readFile(join(cwd, "site-dist", "index.html"), "utf8")).toContain(
      "/_content/assets/post/candidate/hash/cover.webp"
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

  test("ignores HTML entities immediately after packaged static media URLs", async () => {
    const cwd = await fixture();
    const candidateUrl = "/api/public/assets/post/entity/hash/cover.webp";
    await writeFile(join(cwd, "site-dist", "index.html"), `<img src="${candidateUrl}">`);

    await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      fetchImpl: async () => response("image"),
    });

    await writeFile(
      join(cwd, "site-dist", "index.html"),
      '<img src="/_content/assets/post/entity/hash/cover.webp&quot;">'
    );

    await expect(
      verifyPublicMediaPackage({
        cwd,
        mediaOrigin: "https://api.example",
        maxFiles: 100,
        maxProjectBytes: 1024 * 1024,
      })
    ).resolves.toMatchObject({ fileCount: expect.any(Number) });
  });

  test("packages render-id candidates without collapsing their path identity", async () => {
    const cwd = await fixture();
    const candidateUrl = "/api/public/assets/post/logo/hash/wm-a-v1/card.webp?v=2026-10-15";
    await writeFile(join(cwd, "site-dist", "index.html"), `<img src="${candidateUrl}">`);

    const requestedUrls: string[] = [];
    await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      fetchImpl: async (input) => {
        requestedUrls.push(String(input));
        return response("image");
      },
    });

    expect(requestedUrls).toEqual([`https://api.example${candidateUrl}`]);
    expect(await readFile(join(cwd, "site-dist", "index.html"), "utf8")).toContain(
      "/_content/assets/post/logo/hash/wm-a-v1/card.webp?v=2026-10-15"
    );
  });

  test("can freeze both derived watermark variants for a base public asset", async () => {
    const cwd = await fixture();
    const candidateUrl = "/api/public/assets/post/logo/hash/content.webp?v=2026-10-15";
    await writeFile(join(cwd, "site-dist", "snapshot.json"), `{"media":"${candidateUrl}"}`);

    const requestedUrls: string[] = [];
    const manifest = await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      includeDerivedWatermarkVariants: true,
      fetchImpl: async (input) => {
        requestedUrls.push(String(input));
        return response("image");
      },
    });

    expect(requestedUrls).toEqual([
      `https://api.example${candidateUrl}`,
      "https://api.example/api/public/assets/post/logo/hash/wm-a-v3/content.webp?v=2026-10-15",
      "https://api.example/api/public/assets/post/logo/hash/wm-b-v3/content.webp?v=2026-10-15",
    ]);
    expect(manifest.entries.map((entry) => entry.sourcePath)).toEqual([
      "/api/public/assets/post/logo/hash/content.webp?v=2026-10-15",
      "/api/public/assets/post/logo/hash/wm-a-v3/content.webp?v=2026-10-15",
      "/api/public/assets/post/logo/hash/wm-b-v3/content.webp?v=2026-10-15",
    ]);
  });

  test("can freeze the sibling when a snapshot contains one derived watermark variant", async () => {
    const cwd = await fixture();
    const candidateUrl = "/api/public/assets/post/logo/hash/wm-b-v3/content.webp?v=2026-10-15";
    await writeFile(join(cwd, "site-dist", "snapshot.json"), `{"media":"${candidateUrl}"}`);

    const requestedUrls: string[] = [];
    const manifest = await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      includeDerivedWatermarkVariants: true,
      fetchImpl: async (input) => {
        requestedUrls.push(String(input));
        return response("image");
      },
    });

    expect(requestedUrls).toEqual([
      `https://api.example${candidateUrl}`,
      "https://api.example/api/public/assets/post/logo/hash/wm-a-v3/content.webp?v=2026-10-15",
    ]);
    expect(manifest.entries.map((entry) => entry.sourcePath)).toEqual([
      "/api/public/assets/post/logo/hash/wm-a-v3/content.webp?v=2026-10-15",
      "/api/public/assets/post/logo/hash/wm-b-v3/content.webp?v=2026-10-15",
    ]);
  });

  test("fails closed when a current derived watermark variant is missing", async () => {
    const cwd = await fixture();
    const candidateUrl = "/api/public/assets/post/logo/hash/content.webp?v=2026-10-15";
    await writeFile(join(cwd, "site-dist", "snapshot.json"), `{"media":"${candidateUrl}"}`);

    const requestedUrls: string[] = [];
    await expect(
      packagePublicMedia({
        cwd,
        mediaOrigin: "https://api.example",
        siteUrl: "https://site.example",
        downloadAttempts: 1,
        includeDerivedWatermarkVariants: true,
        fetchImpl: async (input) => {
          const url = String(input);
          requestedUrls.push(url);
          if (url.includes("/wm-a-v3/")) return new Response("missing", { status: 404 });
          return response("image");
        },
      })
    ).rejects.toThrow("Media origin returned HTTP 404");
    expect(requestedUrls).toEqual([
      `https://api.example${candidateUrl}`,
      "https://api.example/api/public/assets/post/logo/hash/wm-a-v3/content.webp?v=2026-10-15",
    ]);
  });

  test("falls back legacy derived watermark URLs to one canonical base asset", async () => {
    const cwd = await fixture();
    const watermarkA = "/api/public/assets/post/logo/hash/wm-a-v1/content.webp?v=2026-10-15";
    const watermarkB = "/api/public/assets/post/logo/hash/wm-b-v1/content.webp?v=2026-10-15";
    await writeFile(
      join(cwd, "site-dist", "snapshot.json"),
      JSON.stringify({ media: [watermarkA, watermarkB] })
    );

    const requestedUrls: string[] = [];
    const manifest = await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      downloadAttempts: 1,
      includeDerivedWatermarkVariants: true,
      fetchImpl: async (input) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.includes("/wm-a-v1/") || url.includes("/wm-b-v1/")) {
          return new Response("missing", { status: 404 });
        }
        return response("base-image");
      },
    });

    expect(manifest.packagedCount).toBe(1);
    expect(manifest.entries.filter((entry) => entry.aliasOf)).toHaveLength(2);
    expect(
      manifest.entries
        .filter((entry) => entry.aliasOf)
        .every((entry) => entry.outputPath === "/_content/assets/post/logo/hash/content.webp")
    ).toBe(true);
    expect(await readFile(join(cwd, "site-dist", "snapshot.json"), "utf8")).toContain(
      '"/_content/assets/post/logo/hash/content.webp?v=2026-10-15"'
    );
    await expect(
      verifyPublicMediaPackage({
        cwd,
        mediaOrigin: "https://api.example",
        maxFiles: 100,
        maxProjectBytes: 1024 * 1024,
      })
    ).resolves.toMatchObject({ fileCount: expect.any(Number) });
    expect(
      requestedUrls.filter(
        (url) =>
          url === "https://api.example/api/public/assets/post/logo/hash/content.webp?v=2026-10-15"
      )
    ).toHaveLength(3);
  });

  test("preserves legacy fallback recovery when the HTTP/1.1 fallback fails", async () => {
    const cwd = await fixture();
    const watermark = "/api/public/assets/post/logo/hash/wm-a-v1/content.webp?v=2026-10-15";
    await writeFile(join(cwd, "site-dist", "snapshot.json"), `{"media":"${watermark}"}`);

    const requestedUrls: string[] = [];
    let fallbackAttempts = 0;
    const manifest = await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      downloadAttempts: 1,
      retryDelayMs: 0,
      fetchImpl: async (input) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.includes("/wm-a-v1/")) return new Response("missing", { status: 404 });
        return response("base-image");
      },
      fallbackFetchImpl: async () => {
        fallbackAttempts += 1;
        throw new Error("curl fallback failed");
      },
    });

    expect(fallbackAttempts).toBe(1);
    expect(requestedUrls).toEqual([
      `https://api.example${watermark}`,
      "https://api.example/api/public/assets/post/logo/hash/content.webp?v=2026-10-15",
    ]);
    expect(manifest.packagedCount).toBe(1);
  });

  test("does not hide fallback origin policy errors after a legacy 404", async () => {
    const cwd = await fixture();
    const watermark = "/api/public/assets/post/logo/hash/wm-a-v1/content.webp?v=2026-10-15";
    await writeFile(join(cwd, "site-dist", "snapshot.json"), `{"media":"${watermark}"}`);

    await expect(
      packagePublicMedia({
        cwd,
        mediaOrigin: "https://api.example",
        siteUrl: "https://site.example",
        downloadAttempts: 1,
        fetchImpl: async (input) => {
          if (String(input).includes("/wm-a-v1/")) return new Response("missing", { status: 404 });
          return response("base-image");
        },
        fallbackFetchImpl: async () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://evil.example/content.webp" },
          }),
      })
    ).rejects.toThrow("redirect escaped the configured origin");
  });

  test("freezes the canonical asset for legacy watermark candidates", async () => {
    const cwd = await fixture();
    const watermark = "/api/public/assets/post/logo/hash/wm-b-v1/content.webp?v=2026-10-15";
    await writeFile(join(cwd, "site-dist", "snapshot.json"), `{"media":"${watermark}"}`);

    const requestedUrls: string[] = [];
    const manifest = await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      includeDerivedWatermarkVariants: true,
      fetchImpl: async (input) => {
        requestedUrls.push(String(input));
        return response("image");
      },
    });

    expect(requestedUrls).toContain(
      "https://api.example/api/public/assets/post/logo/hash/content.webp?v=2026-10-15"
    );
    expect(
      manifest.entries.some(
        (entry) =>
          entry.sourcePath === "/api/public/assets/post/logo/hash/content.webp?v=2026-10-15"
      )
    ).toBe(true);
  });

  test("can prefetch v3 watermark variants when migrating a legacy candidate", async () => {
    const cwd = await fixture();
    const watermark = "/api/public/assets/post/logo/hash/wm-b-v1/content.webp?v=2026-10-15";
    await writeFile(join(cwd, "site-dist", "snapshot.json"), `{"media":"${watermark}"}`);

    const requestedUrls: string[] = [];
    await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      includeDerivedWatermarkVariants: true,
      includeMigratedWatermarkVariants: true,
      fetchImpl: async (input) => {
        requestedUrls.push(String(input));
        return response("image");
      },
    });

    expect(requestedUrls).toEqual([
      `https://api.example${watermark}`,
      "https://api.example/api/public/assets/post/logo/hash/content.webp?v=2026-10-15",
      "https://api.example/api/public/assets/post/logo/hash/wm-a-v3/content.webp?v=2026-10-15",
      "https://api.example/api/public/assets/post/logo/hash/wm-b-v3/content.webp?v=2026-10-15",
    ]);
  });

  test("keeps a complete v2 watermark pair on the legacy snapshot version", async () => {
    const cwd = await fixture();
    const watermarkA = "/api/public/assets/post/logo/hash/wm-a-v2/content.webp?v=2026-10-15";
    const watermarkB = "/api/public/assets/post/logo/hash/wm-b-v2/content.webp?v=2026-10-15";
    await writeFile(
      join(cwd, "site-dist", "snapshot.json"),
      JSON.stringify({ media: [watermarkA, watermarkB] })
    );

    const requestedUrls: string[] = [];
    await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      includeDerivedWatermarkVariants: true,
      fetchImpl: async (input) => {
        requestedUrls.push(String(input));
        return response("image");
      },
    });

    expect(requestedUrls).not.toContain(
      "https://api.example/api/public/assets/post/logo/hash/wm-a-v3/content.webp?v=2026-10-15"
    );
    expect(requestedUrls).not.toContain(
      "https://api.example/api/public/assets/post/logo/hash/wm-b-v3/content.webp?v=2026-10-15"
    );
    expect(requestedUrls).toContain(`https://api.example${watermarkA}`);
    expect(requestedUrls).toContain(`https://api.example${watermarkB}`);
  });

  test("does not exempt non-stable or malformed Playbook edition paths", async () => {
    const cwd = await fixture();
    const invalidTagPath = join(
      cwd,
      "site-dist",
      "_content",
      "playbook",
      "latest",
      "a".repeat(64),
      "catalog.json"
    );
    const invalidDigestPath = join(
      cwd,
      "site-dist",
      "_content",
      "playbook",
      "v3.0.0",
      "not-a-digest",
      "catalog.json"
    );
    await mkdir(dirname(invalidTagPath), { recursive: true });
    await mkdir(dirname(invalidDigestPath), { recursive: true });
    await writeFile(
      invalidTagPath,
      '{"media":"/api/public/assets/post/invalid-tag/hash/card.webp"}'
    );
    await writeFile(
      invalidDigestPath,
      '{"media":"/api/public/assets/post/invalid-digest/hash/card.webp"}'
    );

    const requestedUrls: string[] = [];
    await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      fetchImpl: async (input) => {
        requestedUrls.push(String(input));
        return response("image");
      },
    });

    expect(requestedUrls).toEqual([
      "https://api.example/api/public/assets/post/invalid-tag/hash/card.webp",
      "https://api.example/api/public/assets/post/invalid-digest/hash/card.webp",
    ]);
    expect(await readFile(invalidTagPath, "utf8")).toContain("/_content/assets/");
    expect(await readFile(invalidDigestPath, "utf8")).toContain("/_content/assets/");
  });

  test("verifies the configured final EdgeOne media artifact directory", async () => {
    const cwd = await fixture();
    await writeFile(join(cwd, "site-dist", "index.html"), "<main>site</main>");
    await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      fetchImpl: async () => response(""),
    });

    const siteResult = await verifyPublicMediaPackage({
      cwd,
      artifactDir: "site-dist",
      mediaOrigin: "https://api.example",
      maxFiles: 100,
      maxProjectBytes: 1024 * 1024,
    });
    const artifactDir = join(cwd, "edgeone-dist");
    await cp(join(cwd, "site-dist"), artifactDir, { recursive: true });
    await writeFile(
      join(artifactDir, "edgeone.json"),
      '{"headers":[{"source":"/_content/assets/*","headers":[{"key":"Cache-Control","value":"public, max-age=31536000, immutable"}]}]}\n'
    );

    const previousArtifactDir = process.env.PUBLIC_MEDIA_ARTIFACT_DIR;
    process.env.PUBLIC_MEDIA_ARTIFACT_DIR = "edgeone-dist";
    try {
      const artifactResult = await verifyPublicMediaPackage({
        cwd,
        mediaOrigin: "https://api.example",
        maxFiles: 100,
        maxProjectBytes: 1024 * 1024,
      });
      expect(artifactResult.fileCount).toBe(siteResult.fileCount + 1);
    } finally {
      if (previousArtifactDir === undefined) delete process.env.PUBLIC_MEDIA_ARTIFACT_DIR;
      else process.env.PUBLIC_MEDIA_ARTIFACT_DIR = previousArtifactDir;
    }
  });

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
      fetchImpl: async (input) => {
        requestedUrls.push(String(input));
        return response("four", { "content-length": "4" });
      },
    });

    expect(requestedUrls).toEqual([
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
      fetchImpl: async (input) => {
        requestedUrls.push(String(input));
        return response("four", { "content-length": "4" });
      },
    });

    expect(requestedUrls).toEqual([
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
      if (url.includes("/cover.webp")) {
        return response("oversized!!", { "content-length": "11" });
      }
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
    expect(calls).toEqual([
      "GET https://api.example/api/public/assets/post/hello/hash/card.webp?v=1",
      "GET https://api.example/api/public/assets/post/hello/hash/cover.webp?v=1",
    ]);

    const result = await verifyPublicMediaPackage({
      cwd,
      mediaOrigin: "https://api.example",
      siteBasePath: "/",
      maxFiles: 100,
      maxProjectBytes: 1024 * 1024,
    });
    expect(result.fileCount).toBeGreaterThan(1);
  });

  test("uses one GET per asset and cancels oversized response bodies", async () => {
    const cwd = await fixture();
    await writeFile(
      join(cwd, "site-dist", "index.html"),
      [
        '<img src="/api/public/assets/post/one/hash/card.webp">',
        '<img src="/api/public/assets/post/one/hash/cover.webp">',
        '<img src="/api/public/assets/post/one/hash/stream.webp">',
      ].join("\n")
    );

    const calls: string[] = [];
    let oversizedBodyCancelled = false;
    let oversizedStreamCancelled = false;
    const manifest = await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      maxBytes: 10,
      fetchImpl: async (input, init) => {
        const url = String(input);
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (url.endsWith("/cover.webp")) {
          return new Response(
            new ReadableStream<Uint8Array>({
              start: (controller) => controller.enqueue(new Uint8Array(11)),
              cancel: () => {
                oversizedBodyCancelled = true;
              },
            }),
            { status: 200, headers: { "content-length": "11" } }
          );
        }
        if (url.endsWith("/stream.webp")) {
          return new Response(
            new ReadableStream<Uint8Array>({
              start: (controller) => controller.enqueue(new Uint8Array(11)),
              cancel: () => {
                oversizedStreamCancelled = true;
              },
            }),
            { status: 200 }
          );
        }
        return response("tiny", { "content-length": "4" });
      },
    });

    expect(calls).toEqual([
      "GET https://api.example/api/public/assets/post/one/hash/card.webp",
      "GET https://api.example/api/public/assets/post/one/hash/cover.webp",
      "GET https://api.example/api/public/assets/post/one/hash/stream.webp",
    ]);
    expect(oversizedBodyCancelled).toBe(true);
    expect(oversizedStreamCancelled).toBe(true);
    expect(manifest).toMatchObject({ packagedCount: 1, externalCount: 2 });
    const html = await readFile(join(cwd, "site-dist", "index.html"), "utf8");
    expect(html).toContain("https://api.example/api/public/assets/post/one/hash/cover.webp");
    expect(html).toContain("https://api.example/api/public/assets/post/one/hash/stream.webp");
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

  test("cancels same-origin redirect bodies before following the location", async () => {
    const cwd = await fixture();
    const sourceUrl = "https://api.example/api/public/assets/post/redirect/hash/card.webp";
    const targetUrl = "https://api.example/api/public/assets/post/redirect/hash/final.webp";
    await writeFile(
      join(cwd, "site-dist", "index.html"),
      '<img src="/api/public/assets/post/redirect/hash/card.webp">'
    );

    let responseBodyCancelled = false;
    const requestedUrls: string[] = [];
    await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      fetchImpl: async (input) => {
        requestedUrls.push(String(input));
        if (requestedUrls.length === 1) {
          return new Response(
            new ReadableStream<Uint8Array>({
              start: (controller) => controller.enqueue(new Uint8Array([1])),
              cancel: () => {
                responseBodyCancelled = true;
              },
            }),
            { status: 302, headers: { location: targetUrl } }
          );
        }
        return response("four", { "content-length": "4" });
      },
    });

    expect(requestedUrls).toEqual([sourceUrl, targetUrl]);
    expect(responseBodyCancelled).toBe(true);
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

    let responseBodyCancelled = false;
    await expect(
      packagePublicMedia({
        cwd,
        mediaOrigin: "https://api.example",
        siteUrl: "https://site.example",
        downloadAttempts: 1,
        fetchImpl: async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start: (controller) => controller.enqueue(new Uint8Array([1])),
              cancel: () => {
                responseBodyCancelled = true;
              },
            }),
            { status: 404 }
          ),
      })
    ).rejects.toThrow("HTTP 404");
    expect(responseBodyCancelled).toBe(true);
  });

  test("downloads media with one GET without requiring HEAD support", async () => {
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
        return response("animated-derivative", { "content-length": "18" });
      },
    });

    expect(methods).toEqual(["GET"]);
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
      fetchImpl: async (_input) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return response("four", { "content-length": "4" });
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

  test("adds the media URL when Bun returns a native timeout error", async () => {
    const cwd = await fixture();
    const mediaPath = "/api/public/assets/post/native-timeout/hash/card.webp";
    const mediaUrl = `https://api.example${mediaPath}`;
    await writeFile(join(cwd, "site-dist", "index.html"), `<img src="${mediaPath}">`);

    let getAttempts = 0;
    await expect(
      packagePublicMedia({
        cwd,
        mediaOrigin: "https://api.example",
        siteUrl: "https://site.example",
        downloadAttempts: 2,
        retryDelayMs: 0,
        fetchImpl: async () => {
          getAttempts += 1;
          throw new DOMException("The operation timed out.", "TimeoutError");
        },
      })
    ).rejects.toThrow(`Media origin request failed after 2 attempts: ${mediaUrl}`);

    expect(getAttempts).toBe(2);
  });

  test("retries a transient Bun timeout error before packaging the media", async () => {
    const cwd = await fixture();
    const mediaPath = "/api/public/assets/post/transient-timeout/hash/card.webp";
    await writeFile(join(cwd, "site-dist", "index.html"), `<img src="${mediaPath}">`);

    let getAttempts = 0;
    await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      downloadAttempts: 5,
      retryDelayMs: 0,
      fetchImpl: async () => {
        getAttempts += 1;
        if (getAttempts < 5) {
          throw new DOMException("The operation timed out.", "TimeoutError");
        }
        return response("four", { "content-length": "4" });
      },
    });

    expect(getAttempts).toBe(5);
    expect(
      await readFile(
        join(cwd, "site-dist", "_content/assets/post/transient-timeout/hash/card.webp"),
        "utf8"
      )
    ).toBe("four");
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
        fetchImpl: async () => {
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
      fetchImpl: async () => {
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

  test("uses the HTTP/1.1 fallback after media transport retries are exhausted", async () => {
    const cwd = await fixture();
    const mediaPath = "/api/public/assets/post/fallback/hash/card.webp";
    await writeFile(join(cwd, "site-dist", "index.html"), `<img src="${mediaPath}">`);

    let fetchAttempts = 0;
    let fallbackAttempts = 0;
    await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      downloadAttempts: 3,
      retryDelayMs: 0,
      fetchImpl: async () => {
        fetchAttempts += 1;
        throw new Error("socket reset");
      },
      fallbackFetchImpl: async () => {
        fallbackAttempts += 1;
        return response("four", { "content-length": "4" });
      },
    });

    expect(fetchAttempts).toBe(3);
    expect(fallbackAttempts).toBe(1);
    expect(
      await readFile(join(cwd, "site-dist/_content/assets/post/fallback/hash/card.webp"), "utf8")
    ).toBe("four");
  });

  test("retries transient not-found media responses", async () => {
    const cwd = await fixture();
    const mediaPath = "/api/public/assets/post/retry-404/hash/card.webp";
    await writeFile(join(cwd, "site-dist", "index.html"), `<img src="${mediaPath}">`);

    let getAttempts = 0;
    let errorBodyCancelled = false;
    await packagePublicMedia({
      cwd,
      mediaOrigin: "https://api.example",
      siteUrl: "https://site.example",
      downloadAttempts: 2,
      retryDelayMs: 1,
      fetchImpl: async () => {
        getAttempts += 1;
        if (getAttempts === 1) {
          return new Response(
            new ReadableStream<Uint8Array>({
              start: (controller) => controller.enqueue(new Uint8Array([1])),
              cancel: () => {
                errorBodyCancelled = true;
              },
            }),
            { status: 404 }
          );
        }
        return response("four", { "content-length": "4" });
      },
    });

    expect(getAttempts).toBe(2);
    expect(errorBodyCancelled).toBe(true);
    expect(
      await readFile(join(cwd, "site-dist/_content/assets/post/retry-404/hash/card.webp"), "utf8")
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
