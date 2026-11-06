import { afterEach, expect, test } from "bun:test";
import {
  appendFile,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { generateProjectPosterAssets } from "../../scripts/generate-project-poster-assets";
import { generateProjectSocialPreviewAssets } from "../../scripts/generate-project-social-preview-assets";
import { digest, newMediaCacheStats, projectMediaRecipe } from "../../scripts/project-media-cache";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function image(path: string, color = "red") {
  await sharp({ create: { width: 1280, height: 960, channels: 3, background: color } })
    .png()
    .toFile(path);
}
async function fixture(
  generator:
    | typeof generateProjectPosterAssets
    | typeof generateProjectSocialPreviewAssets = generateProjectPosterAssets
) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "media-cache-test-")));
  roots.push(root);
  const sourceDir = join(root, "source");
  const outputDir = join(root, "out");
  const manifestPath = join(root, "manifest.ts");
  const cacheDir = join(root, "cache");
  await mkdir(sourceDir);
  await image(join(sourceDir, "first.png"));
  await image(join(sourceDir, "second.png"), "blue");
  const run = async (extra = {}) => {
    const cacheStats = newMediaCacheStats();
    await generator({ sourceDir, outputDir, manifestPath, cacheDir, cacheStats, ...extra });
    return cacheStats;
  };
  return { root, sourceDir, outputDir, manifestPath, cacheDir, run };
}
async function snapshot(output: string, manifest: string) {
  return [
    await readFile(manifest, "utf8"),
    ...(await Promise.all(
      (
        await readdir(output)
      )
        .sort()
        .map(async (name) => [name, digest(await readFile(join(output, name)))])
    )),
  ];
}
async function entries(cacheDir: string) {
  return (await readdir(cacheDir, { recursive: true }))
    .filter((name) => name.endsWith("entry.json"))
    .map((name) => join(cacheDir, name));
}
for (const [name, generator] of [
  ["poster", generateProjectPosterAssets],
  ["social", generateProjectSocialPreviewAssets],
] as const) {
  test(`${name}: cold/warm identity, one-source invalidation, rename and orphan cleanup`, async () => {
    const f = await fixture(generator);
    expect(await f.run()).toEqual({ hits: 0, rebuilt: 2, unavailable: 0 });
    const cold = await snapshot(f.outputDir, f.manifestPath);
    await rm(f.outputDir, { recursive: true });
    expect(await f.run()).toEqual({ hits: 2, rebuilt: 0, unavailable: 0 });
    expect(await snapshot(f.outputDir, f.manifestPath)).toEqual(cold);
    await image(join(f.sourceDir, "first.png"), "green");
    expect(await f.run()).toEqual({ hits: 1, rebuilt: 1, unavailable: 0 });
    expect(await snapshot(f.outputDir, f.manifestPath)).not.toEqual(cold);
    await writeFile(join(f.outputDir, "unrelated.txt"), "keep");
    await rename(join(f.sourceDir, "first.png"), join(f.sourceDir, "renamed.png"));
    await rm(join(f.sourceDir, "second.png"));
    expect((await f.run()).rebuilt).toBe(1);
    expect(
      (await readdir(f.outputDir)).filter(
        (name) => name.startsWith("first-") || name.startsWith("second-")
      )
    ).toEqual([]);
    expect(await readFile(join(f.outputDir, "unrelated.txt"), "utf8")).toBe("keep");
  });
}

test("missing files, corrupt bytes and incorrect encoded dimensions rebuild only the damaged entry", async () => {
  const f = await fixture();
  await f.run();
  const entryPath = (await entries(f.cacheDir))[0]!;
  let entry = JSON.parse(await readFile(entryPath, "utf8"));
  const directory = entryPath.slice(0, -"entry.json".length);
  await rm(join(directory, entry.files[0].name));
  expect((await f.run()).rebuilt).toBe(1);
  entry = JSON.parse(await readFile(entryPath, "utf8"));
  await writeFile(join(directory, entry.files[0].name), "corrupt");
  expect((await f.run()).rebuilt).toBe(1);
  const wrongSize = await sharp({
    create: { width: 12, height: 12, channels: 3, background: "black" },
  })
    .avif()
    .toBuffer();
  await writeFile(join(directory, entry.files[0].name), wrongSize);
  entry.files[0].sha256 = digest(wrongSize);
  await writeFile(entryPath, JSON.stringify(entry));
  expect((await f.run()).rebuilt).toBe(1);
});

test("entry version, metadata and variant path corruption fail closed", async () => {
  const f = await fixture();
  await f.run();
  const path = (await entries(f.cacheDir))[0]!;
  for (const corrupt of [
    (entry: any) => {
      entry.version = 99;
    },
    (entry: any) => {
      entry.asset.width = 7;
    },
    (entry: any) => {
      entry.asset.placeholder = "data:image/webp;base64,AAAA";
    },
    (entry: any) => {
      entry.files[0].name = "../../escape.webp";
    },
  ]) {
    const entry = JSON.parse(await readFile(path, "utf8"));
    corrupt(entry);
    await writeFile(path, JSON.stringify(entry));
    expect((await f.run()).rebuilt).toBe(1);
  }
  expect((await readdir(f.root)).includes("escape.webp")).toBe(false);
});

test("symlink cache files and directories are rejected without touching their targets", async () => {
  const f = await fixture();
  await f.run();
  const path = (await entries(f.cacheDir))[0]!;
  const outside = join(f.root, "outside.json");
  await writeFile(outside, "keep");
  await rm(path);
  await symlink(outside, path);
  expect((await f.run()).rebuilt).toBe(1);
  expect(await readFile(outside, "utf8")).toBe("keep");
  const inaccessible = join(f.root, "linked-cache");
  await symlink(f.cacheDir, inaccessible);
  expect(await f.run({ cacheDir: inaccessible })).toEqual({ hits: 0, rebuilt: 2, unavailable: 2 });
  expect((await lstat(inaccessible)).isSymbolicLink()).toBe(true);
});

test("unwritable cache is optional but generation failures still stop the build", async () => {
  const f = await fixture();
  const file = join(f.root, "not-a-directory");
  await writeFile(file, "keep");
  expect(await f.run({ cacheDir: file })).toEqual({ hits: 0, rebuilt: 2, unavailable: 2 });
  await writeFile(join(f.sourceDir, "first.png"), "invalid PNG");
  await expect(f.run({ cacheDir: file })).rejects.toThrow();
  expect(await readFile(file, "utf8")).toBe("keep");
});

test("same-key concurrent writers publish complete entries", async () => {
  const f = await fixture();
  await Promise.all([
    f.run(),
    f.run({
      outputDir: join(f.root, "other-output"),
      manifestPath: join(f.root, "other-manifest.ts"),
    }),
  ]);
  expect(await f.run()).toEqual({ hits: 2, rebuilt: 0, unavailable: 0 });
});

test("theme pairing and minimum dimensions are enforced even with a populated cache", async () => {
  const f = await fixture();
  await f.run();
  await rename(join(f.sourceDir, "first.png"), join(f.sourceDir, "first-light.png"));
  await expect(f.run()).rejects.toThrow(/both light and dark/);
  await sharp({ create: { width: 30, height: 30, channels: 3, background: "red" } })
    .png()
    .toFile(join(f.sourceDir, "first-light.png"));
  await expect(f.run()).rejects.toThrow(/at least 960px/);
});

test("recipe invalidates on actual generator, rule, shared helper and encoder changes but not build identity", async () => {
  const f = await fixture();
  const repository = resolve(import.meta.dir, "../..");
  for (const file of [
    "scripts/project-media-cache.ts",
    "scripts/generate-project-poster-assets.ts",
    "scripts/generate-project-social-preview-assets.ts",
    "site/lib/project-poster-media.ts",
    "site/lib/project-social-preview-media.ts",
  ]) {
    const directory = join(f.root, file.slice(0, file.lastIndexOf("/")));
    await mkdir(directory, { recursive: true });
    await cp(join(repository, file), join(f.root, file));
  }
  let poster = await projectMediaRecipe("posters", f.root);
  const social = await projectMediaRecipe("social", f.root);
  for (const file of [
    "scripts/generate-project-poster-assets.ts",
    "site/lib/project-poster-media.ts",
  ]) {
    await appendFile(join(f.root, file), "\n// changed recipe\n");
    expect(await projectMediaRecipe("posters", f.root)).not.toBe(poster);
    expect(await projectMediaRecipe("social", f.root)).toBe(social);
    poster = await projectMediaRecipe("posters", f.root);
  }
  await appendFile(join(f.root, "scripts/project-media-cache.ts"), "\n// changed shared recipe\n");
  expect(await projectMediaRecipe("posters", f.root)).not.toBe(poster);
  expect(await projectMediaRecipe("social", f.root)).not.toBe(social);
  poster = await projectMediaRecipe("posters", f.root);
  const previous = { commit: process.env.COMMIT_HASH, vips: sharp.versions.vips };
  try {
    process.env.COMMIT_HASH = "f".repeat(40);
    expect(await projectMediaRecipe("posters", f.root)).toBe(poster);
    sharp.versions.vips = "test-encoder-version";
    expect(await projectMediaRecipe("posters", f.root)).not.toBe(poster);
  } finally {
    if (previous.commit === undefined) delete process.env.COMMIT_HASH;
    else process.env.COMMIT_HASH = previous.commit;
    sharp.versions.vips = previous.vips;
  }
});
