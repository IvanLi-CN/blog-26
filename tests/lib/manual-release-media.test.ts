import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type FrozenConfig, packageFrozenMedia } from "../../src/lib/release/inputs";

test("frozen media reuse ignores cache-buster changes but rejects new content identities", async () => {
  const root = await mkdtemp(join(tmpdir(), "release-media-"));
  const inputs = join(root, "inputs");
  const output = join(root, "site");
  await mkdir(join(inputs, "media/_content/assets/post/test"), { recursive: true });
  await mkdir(output);
  await writeFile(join(inputs, "media/_content/assets/post/test/cover.webp"), "frozen-image-bytes");
  await writeFile(
    join(inputs, "media/_content/media-manifest.json"),
    JSON.stringify({
      entries: [
        {
          sourcePath: "/api/public/assets/post/test/cover.webp?v=1",
          outputPath: "/_content/assets/post/test/cover.webp",
          status: "packaged",
        },
      ],
    })
  );
  await writeFile(
    join(output, "index.html"),
    '<img src="/api/public/assets/post/test/cover.webp?v=2">'
  );
  const config: FrozenConfig = {
    schemaVersion: 1,
    identity: "a".repeat(64),
    productVersion: "2.8.0",
    sourceSha: "b".repeat(40),
    buildDate: "2026-10-07T00:00:00Z",
    bunVersion: "1.4.2",
    nodeVersion: "v22.23.2",
    baseImages: {
      build: `oven/bun@sha256:${"c".repeat(64)}`,
      runtime: `oven/bun@sha256:${"d".repeat(64)}`,
    },
    env: {
      PUBLIC_API_BASE_URL: "https://console.ivanli.cc",
      PUBLIC_SITE_URL: "https://ivanli.cc",
      PUBLIC_SITE_BASE_PATH: "/",
    },
  };
  await packageFrozenMedia(inputs, config, output);
  expect(await readFile(join(output, "_content/assets/post/test/cover.webp"), "utf8")).toBe(
    "frozen-image-bytes"
  );
  expect(await readFile(join(output, "index.html"), "utf8")).toContain(
    "/_content/assets/post/test/cover.webp?v=2"
  );
  await writeFile(
    join(output, "index.html"),
    '<img src="/api/public/assets/post/test/other.webp">'
  );
  await expect(packageFrozenMedia(inputs, config, output)).rejects.toThrow("not covered");
});
