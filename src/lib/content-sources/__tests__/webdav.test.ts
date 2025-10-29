import { describe, expect, it } from "bun:test";
import type { WebDAVClient, WebDAVFile } from "../../webdav";
import { WebDAVContentSource } from "../webdav";

const createMockFile = (overrides: Partial<WebDAVFile>): WebDAVFile => ({
  filename: "/Posts/example.md",
  basename: "example.md",
  lastmod: new Date().toISOString(),
  size: 100,
  type: "file",
  ...overrides,
});

describe("WebDAVContentSource", () => {
  const baseConfig = {
    name: "webdav-test",
    priority: 1,
    enabled: true,
    options: {
      pathMappings: {
        posts: ["/Posts"],
        projects: [],
        memos: [],
      },
    },
  } as const;

  it("should ignore underscore-prefixed markdown files when scanning directories", async () => {
    const contentSource = new WebDAVContentSource(baseConfig);

    const mockClient = {
      listFiles: async () => [
        createMockFile({ filename: "/Posts/_readme.md", basename: "_readme.md" }),
        createMockFile({ filename: "/Posts/visible.md", basename: "visible.md" }),
        createMockFile({ filename: "/Posts/image.png", basename: "image.png" }),
      ],
    } satisfies Partial<WebDAVClient>;

    (contentSource as unknown as { webdavClient: WebDAVClient }).webdavClient =
      mockClient as WebDAVClient;

    await (contentSource as unknown as { scanWebDAVDirectory: Function }).scanWebDAVDirectory(
      "/Posts",
      "posts"
    );

    const fileCache = (contentSource as unknown as { fileCache: Map<string, unknown> }).fileCache;

    expect(fileCache.has("/Posts/_readme.md")).toBe(false);
    expect(fileCache.has("/Posts/visible.md")).toBe(true);
    expect(fileCache.has("/Posts/image.png")).toBe(true);
  });
});
