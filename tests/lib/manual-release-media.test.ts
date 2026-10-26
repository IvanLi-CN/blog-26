import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

test("frozen media reuse serves derived watermark variants from the sealed manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "release-media-derived-"));
  const inputs = join(root, "inputs");
  const output = join(root, "site");
  for (const renderId of ["wm-a-v1", "wm-b-v1"]) {
    await mkdir(join(inputs, `media/_content/assets/post/test/${renderId}`), { recursive: true });
    await writeFile(
      join(inputs, `media/_content/assets/post/test/${renderId}/content.webp`),
      `${renderId}-bytes`
    );
  }
  await mkdir(output);
  await writeFile(
    join(inputs, "media/_content/media-manifest.json"),
    JSON.stringify({
      entries: [
        {
          sourcePath: "/api/public/assets/post/test/wm-a-v1/content.webp?v=1",
          outputPath: "/_content/assets/post/test/wm-a-v1/content.webp",
          status: "packaged",
        },
        {
          sourcePath: "/api/public/assets/post/test/wm-b-v1/content.webp?v=1",
          outputPath: "/_content/assets/post/test/wm-b-v1/content.webp",
          status: "packaged",
        },
      ],
    })
  );
  await writeFile(
    join(output, "index.html"),
    '<img src="/api/public/assets/post/test/wm-b-v1/content.webp?v=2">'
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
  expect(
    await readFile(join(output, "_content/assets/post/test/wm-b-v1/content.webp"), "utf8")
  ).toBe("wm-b-v1-bytes");
});

test("frozen media reuse matches a packaged output when the source format was aliased", async () => {
  const root = await mkdtemp(join(tmpdir(), "release-media-format-alias-"));
  const inputs = join(root, "inputs");
  const output = join(root, "site");
  const outputPath = "/_content/assets/memo/test/hash/wm-a-v4/card.webp";
  await mkdir(join(inputs, "media", outputPath.slice(1, outputPath.lastIndexOf("/"))), {
    recursive: true,
  });
  await mkdir(output);
  await writeFile(join(inputs, "media", outputPath.slice(1)), "aliased-card-bytes");
  await writeFile(
    join(inputs, "media/_content/media-manifest.json"),
    JSON.stringify({
      entries: [
        {
          sourcePath: "/api/public/assets/memo/test/hash/wm-a-v4/card.gif",
          outputPath,
          status: "packaged",
        },
      ],
    })
  );
  await writeFile(
    join(output, "index.html"),
    '<img src="/api/public/assets/memo/test/hash/wm-a-v4/card.webp">'
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
  expect(await readFile(join(output, outputPath.slice(1)), "utf8")).toBe("aliased-card-bytes");
});

test("frozen media reuse serves captured clipping resources", async () => {
  const root = await mkdtemp(join(tmpdir(), "release-media-clipping-"));
  const inputs = join(root, "inputs");
  const output = join(root, "site");
  const hash = "a".repeat(64);
  const sourcePath = `/api/public/memos/clip/clipping/assets/version-1/${hash}.png`;
  const outputPath = `/_content/assets/memos/clip/clipping/assets/version-1/${hash}.png`;
  const frozenPath = join(inputs, "media", outputPath.slice(1));
  await mkdir(dirname(frozenPath), { recursive: true });
  await mkdir(output);
  await writeFile(frozenPath, "clipping-image-bytes");
  await writeFile(
    join(inputs, "media/_content/media-manifest.json"),
    JSON.stringify({
      entries: [{ sourcePath, outputPath, status: "packaged" }],
    })
  );
  await writeFile(join(output, "index.html"), `<img src="${sourcePath}">`);
  const config = {
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
  } satisfies FrozenConfig;
  await packageFrozenMedia(inputs, config, output);
  expect(await readFile(join(output, outputPath.slice(1)), "utf8")).toBe("clipping-image-bytes");
});
