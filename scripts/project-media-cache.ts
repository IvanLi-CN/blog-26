import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, parse, resolve } from "node:path";
import sharp from "sharp";

export const mediaCacheRoot = resolve(import.meta.dir, "../.cache/project-media/v1");
export type MediaKind = "posters" | "social";
type Asset = {
  width: number;
  height: number;
  placeholder: string;
  sources: Record<string, Record<string, string>>;
};
export type MediaVariant = {
  name: string;
  width: number;
  height: number;
  format: "avif" | "webp";
  budget: number;
};
type Entry = { version: 1; key: string; asset: Asset; files: { name: string; sha256: string }[] };
export type MediaCacheStats = { hits: number; rebuilt: number; unavailable: number };
export const newMediaCacheStats = (): MediaCacheStats => ({ hits: 0, rebuilt: 0, unavailable: 0 });
export const digest = (data: string | Uint8Array) =>
  createHash("sha256").update(data).digest("hex");

// Reject symlink components, including restored directory entries. Only callers own these paths.
async function safeDirectory(path: string, create = false) {
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const component of absolute.slice(current.length).split("/")) {
    if (!component) continue;
    current = join(current, component);
    if (create)
      await mkdir(current).catch((error) => {
        if (error.code !== "EEXIST") throw error;
      });
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error(`Unsafe media directory: ${current}`);
  }
}
async function readRegular(path: string) {
  await safeDirectory(dirname(path));
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!(await file.stat()).isFile()) throw new Error("Media cache entry is not a regular file");
    return await file.readFile();
  } finally {
    await file.close();
  }
}
async function atomicFile(path: string, bytes: Uint8Array) {
  await safeDirectory(dirname(path), true);
  const temporary = join(dirname(path), `.media-${randomUUID()}`);
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function projectMediaRecipe(kind: MediaKind, root = resolve(import.meta.dir, "..")) {
  const generator = kind === "posters" ? "poster" : "social-preview";
  const report = process.report?.getReport() as
    | { header?: { glibcVersionRuntime?: string } }
    | undefined;
  const files = [
    "scripts/project-media-cache.ts",
    `scripts/generate-project-${generator}-assets.ts`,
    `site/lib/project-${generator}-media.ts`,
  ];
  return digest(
    JSON.stringify({
      version: 1,
      kind,
      bun: Bun.version,
      platform: process.platform,
      arch: process.arch,
      libc: process.platform === "linux" ? (report?.header?.glibcVersionRuntime ?? "musl") : "none",
      sharp: sharp.versions,
      files: await Promise.all(
        files.map(async (path) => [
          path,
          digest(
            await Bun.file(join(root, path))
              .arrayBuffer()
              .then((b) => new Uint8Array(b))
          ),
        ])
      ),
    })
  );
}

function assertAsset(value: Asset, expected: Asset, placeholderMaxBytes: number) {
  if (
    value.width !== expected.width ||
    value.height !== expected.height ||
    JSON.stringify(value.sources) !== JSON.stringify(expected.sources)
  )
    throw new Error("Invalid media metadata");
  if (
    typeof value.placeholder !== "string" ||
    !/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.placeholder)
  )
    throw new Error("Invalid media placeholder");
  const bytes = Buffer.from(value.placeholder.split(",")[1]!, "base64");
  if (bytes.length > placeholderMaxBytes) throw new Error("Oversized media placeholder");
  return bytes;
}

export async function cachedProjectMediaAsset<T extends Asset>(options: {
  kind: MediaKind;
  recipe: string;
  sourcePath: string;
  stem: string;
  cacheDir: string;
  outputDir: string;
  expected: T;
  variants: MediaVariant[];
  placeholderMaxBytes: number;
  placeholderHeight: number;
  stats: MediaCacheStats;
  activeKeys: Set<string>;
  generate: (outputDir: string) => Promise<T>;
}): Promise<T> {
  const { recipe, sourcePath, stem, cacheDir, outputDir, expected, variants, stats } = options;
  const key = digest(
    JSON.stringify([recipe, basename(sourcePath), stem, digest(await readRegular(sourcePath))])
  );
  options.activeKeys.add(key);
  const entryDir = join(cacheDir, options.kind, recipe, key);
  async function validate(entry: Entry, directory: string) {
    if (
      entry.version !== 1 ||
      entry.key !== key ||
      !Array.isArray(entry.files) ||
      entry.files.length !== variants.length
    )
      throw new Error("Invalid media cache envelope");
    const placeholder = assertAsset(entry.asset, expected, options.placeholderMaxBytes);
    const preview = await sharp(placeholder).metadata();
    if (
      preview.format !== "webp" ||
      preview.width !== 32 ||
      preview.height !== options.placeholderHeight
    )
      throw new Error("Invalid media placeholder dimensions");
    const buffers: Buffer[] = [];
    for (const [index, variant] of variants.entries()) {
      const file = entry.files[index];
      if (!file || file.name !== variant.name || basename(file.name) !== file.name)
        throw new Error("Invalid media cache path");
      const buffer = await readRegular(join(directory, variant.name));
      if (digest(buffer) !== file.sha256 || buffer.length > variant.budget)
        throw new Error("Invalid media cache digest or budget");
      const metadata = await sharp(buffer).metadata();
      if (
        metadata.width !== variant.width ||
        metadata.height !== variant.height ||
        metadata.format !== (variant.format === "avif" ? "heif" : "webp")
      )
        throw new Error("Invalid media cache dimensions or format");
      buffers.push(buffer);
    }
    return buffers;
  }
  try {
    const entry = JSON.parse((await readRegular(join(entryDir, "entry.json"))).toString()) as Entry;
    const buffers = await validate(entry, entryDir);
    for (const [index, variant] of variants.entries())
      await atomicFile(join(outputDir, variant.name), buffers[index]!);
    stats.hits++;
    return entry.asset as T;
  } catch {
    /* A miss, corrupt or inaccessible cache never replaces real generation. */
  }

  const temporary = await mkdtemp(join(await realpath(tmpdir()), "project-media-"));
  try {
    const asset = await options.generate(temporary);
    const files = await Promise.all(
      variants.map(async ({ name }) => ({
        name,
        sha256: digest(await readRegular(join(temporary, name))),
      }))
    );
    const entry: Entry = { version: 1, key, asset, files };
    const buffers = await validate(entry, temporary);
    for (const [index, variant] of variants.entries())
      await atomicFile(join(outputDir, variant.name), buffers[index]!);
    stats.rebuilt++;
    try {
      await safeDirectory(dirname(entryDir), true);
      // Unique staging + rename prevents readers from seeing partially written entries.
      const staging = await mkdtemp(join(dirname(entryDir), ".pending-"));
      try {
        for (const [index, variant] of variants.entries())
          await writeFile(join(staging, variant.name), buffers[index]!, { flag: "wx" });
        await writeFile(join(staging, "entry.json"), JSON.stringify(entry), { flag: "wx" });
        // Remove only the exact invalid entry; concurrent complete entries are equivalent.
        await safeDirectory(entryDir)
          .then(() => rm(entryDir, { recursive: true, force: true }))
          .catch(() => {});
        await rename(staging, entryDir).catch((error) => {
          if (error.code !== "EEXIST" && error.code !== "ENOTEMPTY") throw error;
        });
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
    } catch (error) {
      stats.unavailable++;
      console.warn(
        `[project-media] cache write unavailable: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return asset;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function pruneMediaOutputs(outputDir: string, expected: Set<string>) {
  await safeDirectory(outputDir);
  let removed = 0;
  for (const name of await readdir(outputDir)) {
    if (/-\d+\.(?:avif|webp)$/.test(name) && !expected.has(name)) {
      const path = join(outputDir, name);
      const info = await lstat(path);
      if (info.isFile() || info.isSymbolicLink()) {
        await rm(path);
        removed++;
      }
    }
  }
  return removed;
}

// Keep aggregate packs bounded to the current source set, without touching unknown files.
export async function pruneMediaCacheEntries(
  cacheDir: string,
  kind: MediaKind,
  recipe: string,
  activeKeys: Set<string>
) {
  const directory = join(cacheDir, kind, recipe);
  try {
    await safeDirectory(directory);
    const kindDirectory = join(cacheDir, kind);
    for (const name of await readdir(kindDirectory)) {
      if (/^[a-f0-9]{64}$/.test(name) && name !== recipe) {
        const old = join(kindDirectory, name);
        const info = await lstat(old);
        if (info.isSymbolicLink()) await rm(old);
        else if (info.isDirectory()) await rm(old, { recursive: true, force: true });
      }
    }
    for (const name of await readdir(directory)) {
      if (/^[a-f0-9]{64}$/.test(name) && !activeKeys.has(name)) {
        const path = join(directory, name);
        const info = await lstat(path);
        if (info.isSymbolicLink()) await rm(path);
        else if (info.isDirectory()) await rm(path, { recursive: true, force: true });
      }
    }
  } catch {
    /* Optional cache housekeeping must not replace build validation. */
  }
}
