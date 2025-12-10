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

    const scanDirectory = (
      contentSource as unknown as {
        scanWebDAVDirectory: (path: string, contentType: string) => Promise<void>;
      }
    ).scanWebDAVDirectory.bind(contentSource);

    await scanDirectory("/Posts", "posts");

    const fileCache = (contentSource as unknown as { fileCache: Map<string, unknown> }).fileCache;

    expect(fileCache.has("/Posts/_readme.md")).toBe(false);
    expect(fileCache.has("/Posts/visible.md")).toBe(true);
    expect(fileCache.has("/Posts/image.png")).toBe(true);
  });

  it("detectChanges(lastSyncTime) should only fetch and return files modified after lastSyncTime", async () => {
    const contentSource = new WebDAVContentSource(baseConfig);

    const now = Date.now();
    const twoHoursAgoIso = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    const thirtyMinutesAgoIso = new Date(now - 30 * 60 * 1000).toISOString();
    const tenMinutesAgoIso = new Date(now - 10 * 60 * 1000).toISOString();

    const filesForPosts: WebDAVFile[] = [
      createMockFile({
        filename: "/Posts/old.md",
        basename: "old.md",
        lastmod: twoHoursAgoIso,
      }),
      createMockFile({
        filename: "/Posts/changed-1.md",
        basename: "changed-1.md",
        lastmod: thirtyMinutesAgoIso,
      }),
      createMockFile({
        filename: "/Posts/changed-2.md",
        basename: "changed-2.md",
        lastmod: tenMinutesAgoIso,
      }),
    ];

    const requestedPaths: string[] = [];

    const mockClient: Partial<WebDAVClient> = {
      // directory scan used by refreshFileCache/scanWebDAVDirectory
      listFiles: async (dirPath: string) => {
        if (dirPath === "/Posts/") {
          return filesForPosts;
        }
        return [];
      },
      // body content for changed files
      getFileContent: async (filePath: string) => {
        requestedPaths.push(filePath);
        return `# ${filePath}\n\nBody`;
      },
    };

    // 注入 mock WebDAV 客户端与初始化状态
    (contentSource as unknown as { webdavClient: WebDAVClient }).webdavClient =
      mockClient as WebDAVClient;
    (contentSource as unknown as { isInitialized: boolean }).isInitialized = true;
    (contentSource as unknown as { maxConcurrentRequests: number }).maxConcurrentRequests = 2;

    const lastSyncTime = new Date(now - 60 * 60 * 1000).getTime(); // 1 小时前

    const changeSet = await contentSource.detectChanges(lastSyncTime);

    // 只有 30 分钟前和 10 分钟前的两个文件被视为变更
    expect(changeSet.sourceName).toBe("webdav-test");
    expect(changeSet.stats.total).toBe(2);
    expect(changeSet.stats.created).toBe(0);
    expect(changeSet.stats.updated).toBe(2);
    expect(changeSet.stats.deleted).toBe(0);
    expect(changeSet.stats.skipped).toBe(1);

    const changedIds = changeSet.changes.map((c) => c.item.id).sort();
    expect(changedIds).toEqual(["/Posts/changed-1.md", "/Posts/changed-2.md"].sort());

    // WebDAV 客户端只对真正变更的两个文件发起了正文请求
    expect(requestedPaths.sort()).toEqual(["/Posts/changed-1.md", "/Posts/changed-2.md"].sort());
  });
});
