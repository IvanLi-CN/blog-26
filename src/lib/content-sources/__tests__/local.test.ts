import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalContentSource } from "../local";
import { inferContentTypeFromPath } from "../utils";

const REAL_LAYOUT_MAPPINGS = {
  posts: ["/Hardware", "/HomeLab", "/Ops", "/Project"],
  projects: ["/Projects"],
  memos: ["/Memos"],
} as const;

const tempDirs: string[] = [];

async function createTempContentDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "blog25-local-source-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("LocalContentSource real path mappings", () => {
  it("infers content types from configured real roots", () => {
    expect(inferContentTypeFromPath("Hardware/usb-pd.md", REAL_LAYOUT_MAPPINGS)).toBe("post");
    expect(inferContentTypeFromPath("Project/demo.md", REAL_LAYOUT_MAPPINGS)).toBe("post");
    expect(inferContentTypeFromPath("Projects/sdk.md", REAL_LAYOUT_MAPPINGS)).toBe("project");
    expect(inferContentTypeFromPath("Memos/daily-note.md", REAL_LAYOUT_MAPPINGS)).toBe("memo");
  });

  it("scans only configured real roots under the local base path", async () => {
    const basePath = await createTempContentDir();

    await mkdir(join(basePath, "Hardware"), { recursive: true });
    await mkdir(join(basePath, "Memos"), { recursive: true });
    await mkdir(join(basePath, "Journals"), { recursive: true });

    await writeFile(join(basePath, "Hardware", "usb-pd.md"), "# USB PD\n\nPost body\n", "utf-8");
    await writeFile(join(basePath, "Memos", "daily.md"), "# Daily\n\nMemo body\n", "utf-8");
    await writeFile(join(basePath, "Journals", "private.md"), "# Private\n\nIgnore me\n", "utf-8");

    const source = new LocalContentSource(
      LocalContentSource.createDefaultConfig("local-test", 1, {
        contentPath: basePath,
        pathMappings: REAL_LAYOUT_MAPPINGS,
      })
    );

    await source.initialize();
    const items = await source.listContent();

    const indexedItems = new Map(items.map((item) => [item.filePath, item]));

    expect([...indexedItems.keys()].sort()).toEqual(["Hardware/usb-pd.md", "Memos/daily.md"]);
    expect(indexedItems.get("Hardware/usb-pd.md")?.type).toBe("post");
    expect(indexedItems.get("Memos/daily.md")?.type).toBe("memo");
    expect(indexedItems.has("Journals/private.md")).toBe(false);
  });
});
