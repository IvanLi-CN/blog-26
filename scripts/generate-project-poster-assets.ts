#!/usr/bin/env bun

import { mkdir, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import sharp from "sharp";
import {
  type ProjectPosterAsset,
  type ProjectPosterFormat,
  type ProjectPosterTheme,
  type ProjectPosterThemedAsset,
  type ProjectPosterWidth,
  projectPosterBudgets,
  projectPosterFormats,
  projectPosterPlaceholderMaxBytes,
  projectPosterWidths,
} from "../site/lib/project-poster-media";
import {
  cachedProjectMediaAsset,
  type MediaCacheStats,
  mediaCacheRoot,
  newMediaCacheStats,
  projectMediaRecipe,
  pruneMediaCacheEntries,
  pruneMediaOutputs,
} from "./project-media-cache";

const SOURCE_THEME_PATTERN = /^(?<slug>.+)-(?:light|dark)$/;

export type ProjectPosterSource = {
  sourcePath: string;
  stem: string;
  slug: string;
  theme: ProjectPosterTheme | null;
};

export type GenerateProjectPosterAssetsOptions = {
  sourceDir?: string;
  outputDir?: string;
  manifestPath?: string;
  cacheDir?: string;
  cacheStats?: MediaCacheStats;
};

export type GeneratedProjectPosterAssets = {
  assets: Record<string, ProjectPosterAsset>;
  themedAssets: Record<string, ProjectPosterThemedAsset>;
  sources: ProjectPosterSource[];
};

function projectRoot() {
  return resolve(import.meta.dir, "..");
}

function defaultOptions(): Required<Omit<GenerateProjectPosterAssetsOptions, "cacheStats">> {
  const root = projectRoot();
  return {
    cacheDir: mediaCacheRoot,
    sourceDir: resolve(root, "site/assets/projects/posters-source"),
    outputDir: resolve(root, "public/projects/posters"),
    manifestPath: resolve(root, "site/generated/project-poster-assets.ts"),
  };
}

function inferSourceIdentity(
  fileName: string
): Pick<ProjectPosterSource, "stem" | "slug" | "theme"> {
  const stem = basename(fileName, extname(fileName));
  const match = stem.match(SOURCE_THEME_PATTERN);
  if (!match?.groups?.slug) return { stem, slug: stem, theme: null };

  const theme = stem.endsWith("-dark") ? "dark" : "light";
  return { stem, slug: match.groups.slug, theme };
}

export async function discoverProjectPosterSources(
  sourceDir: string
): Promise<ProjectPosterSource[]> {
  const entries = (await readdir(sourceDir)).filter((entry) => extname(entry) === ".png").sort();
  if (entries.length === 0) {
    throw new Error(`No PNG poster sources found in ${sourceDir}`);
  }

  return entries.map((fileName) => ({
    sourcePath: join(sourceDir, fileName),
    ...inferSourceIdentity(fileName),
  }));
}

export function generatedProjectPosterFileName(
  stem: string,
  width: ProjectPosterWidth,
  format: ProjectPosterFormat
) {
  return `${stem}-${width}.${format}`;
}

async function assertNoPublicSourcePng(outputDir: string) {
  const entries = await readdir(outputDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const entryPath = join(outputDir, entry.name);
    if (entry.isDirectory()) {
      await assertNoPublicSourcePng(entryPath);
      continue;
    }
    if (entry.isFile() && extname(entry.name).toLowerCase() === ".png") {
      throw new Error(`Raw PNG poster must not remain in ${outputDir}: ${entry.name}`);
    }
  }
}

async function encodeWithinBudget(
  sourcePath: string,
  format: ProjectPosterFormat,
  width: ProjectPosterWidth
) {
  const budget = projectPosterBudgets[width][format];
  const startQuality = format === "avif" ? 55 : 72;
  const minimumQuality = format === "avif" ? 35 : 50;

  for (let quality = startQuality; quality >= minimumQuality; quality -= 1) {
    const pipeline = sharp(sourcePath).rotate().resize({ width, withoutEnlargement: false });
    const buffer =
      format === "avif"
        ? await pipeline.avif({ quality, effort: 3 }).toBuffer()
        : await pipeline.webp({ quality, effort: 4 }).toBuffer();

    if (buffer.byteLength <= budget) return buffer;
  }

  throw new Error(
    `${basename(sourcePath)} cannot satisfy the ${width}w ${format} budget of ${budget} bytes`
  );
}

async function generateAsset(
  source: ProjectPosterSource,
  outputDir: string
): Promise<ProjectPosterAsset> {
  const metadata = await sharp(source.sourcePath).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 960) {
    throw new Error(`${basename(source.sourcePath)} must be at least 960px wide`);
  }

  const sources = {} as ProjectPosterAsset["sources"];
  for (const format of projectPosterFormats) {
    const variants = {} as Record<ProjectPosterWidth, string>;
    for (const width of projectPosterWidths) {
      const outputName = generatedProjectPosterFileName(source.stem, width, format);
      const outputPath = join(outputDir, outputName);
      const buffer = await encodeWithinBudget(source.sourcePath, format, width);
      await writeFile(outputPath, buffer);
      variants[width] = `/projects/posters/${outputName}`;
    }
    sources[format] = variants;
  }

  const placeholderBuffer = await sharp(source.sourcePath)
    .rotate()
    .resize({ width: 32, withoutEnlargement: true })
    .webp({ quality: 35, effort: 4 })
    .toBuffer();
  if (placeholderBuffer.byteLength > projectPosterPlaceholderMaxBytes) {
    throw new Error(`${basename(source.sourcePath)} low-quality preview exceeds 2 KiB`);
  }

  return {
    width: metadata.width,
    height: metadata.height,
    placeholder: `data:image/webp;base64,${placeholderBuffer.toString("base64")}`,
    sources,
  };
}

function renderManifest(
  assets: Record<string, ProjectPosterAsset>,
  themedAssets: Record<string, ProjectPosterThemedAsset>
) {
  return [
    'import type { ProjectPosterAsset, ProjectPosterThemedAsset } from "../lib/project-poster-media";',
    "",
    `export const projectPosterAssets: Record<string, ProjectPosterAsset> = ${JSON.stringify(assets, null, 2)};`,
    "",
    `export const projectPosterThemedAssets: Record<string, ProjectPosterThemedAsset> = ${JSON.stringify(themedAssets, null, 2)};`,
    "",
  ].join("\n");
}

export async function generateProjectPosterAssets(
  options: GenerateProjectPosterAssetsOptions = {}
): Promise<GeneratedProjectPosterAssets> {
  const defaults = defaultOptions();
  const sourceDir = await realpath(options.sourceDir ?? defaults.sourceDir);
  const requestedOutputDir = options.outputDir ?? defaults.outputDir;
  await mkdir(requestedOutputDir, { recursive: true });
  const outputDir = await realpath(requestedOutputDir);
  const manifestPath = options.manifestPath ?? defaults.manifestPath;
  const sources = await discoverProjectPosterSources(sourceDir);

  await mkdir(outputDir, { recursive: true });
  await assertNoPublicSourcePng(outputDir);
  const started = performance.now();
  const stats = options.cacheStats ?? newMediaCacheStats();
  const recipe = await projectMediaRecipe("posters");
  const expectedFiles = new Set<string>();
  const activeKeys = new Set<string>();

  const assets: Record<string, ProjectPosterAsset> = {};
  const themedDrafts: Record<string, Partial<ProjectPosterThemedAsset>> = {};
  for (const source of sources) {
    const metadata = await sharp(source.sourcePath).metadata();
    if (!metadata.width || !metadata.height || metadata.width < 960)
      throw new Error(`${basename(source.sourcePath)} must be at least 960px wide`);
    const rotatedWidth = (metadata.orientation ?? 1) >= 5 ? metadata.height : metadata.width;
    const rotatedHeight = (metadata.orientation ?? 1) >= 5 ? metadata.width : metadata.height;
    const sources = {} as ProjectPosterAsset["sources"];
    const variants = [];
    for (const format of projectPosterFormats) {
      sources[format] = {} as Record<ProjectPosterWidth, string>;
      for (const width of projectPosterWidths) {
        const name = generatedProjectPosterFileName(source.stem, width, format);
        expectedFiles.add(name);
        sources[format][width] = `/projects/posters/${name}`;
        const actualWidth = width;
        variants.push({
          name,
          width: actualWidth,
          height: Math.round((rotatedHeight * actualWidth) / rotatedWidth),
          format,
          budget: projectPosterBudgets[width][format],
        });
      }
    }
    const asset = await cachedProjectMediaAsset({
      kind: "posters",
      recipe,
      sourcePath: source.sourcePath,
      stem: source.stem,
      cacheDir: options.cacheDir ?? defaults.cacheDir,
      outputDir,
      stats,
      activeKeys,
      variants,
      expected: { width: metadata.width, height: metadata.height, placeholder: "", sources },
      placeholderHeight: Math.round((rotatedHeight * 32) / rotatedWidth),
      placeholderMaxBytes: projectPosterPlaceholderMaxBytes,
      generate: (directory) => generateAsset(source, directory),
    });
    if (source.theme) {
      themedDrafts[source.slug] ??= {};
      themedDrafts[source.slug][source.theme] = asset;
    } else {
      assets[source.slug] = asset;
    }
  }

  const themedAssets: Record<string, ProjectPosterThemedAsset> = {};
  for (const [slug, draft] of Object.entries(themedDrafts)) {
    if (!draft.light || !draft.dark) {
      throw new Error(`Themed project poster ${slug} must provide both light and dark PNG sources`);
    }
    themedAssets[slug] = { light: draft.light, dark: draft.dark };
  }

  const removed = await pruneMediaOutputs(outputDir, expectedFiles);
  await pruneMediaCacheEntries(
    options.cacheDir ?? defaults.cacheDir,
    "posters",
    recipe,
    activeKeys
  );
  console.log(
    `[project-media:posters] hits=${stats.hits} rebuilt=${stats.rebuilt} unavailable=${stats.unavailable} removed=${removed} elapsed_ms=${Math.round(performance.now() - started)}`
  );
  await mkdir(resolve(manifestPath, ".."), { recursive: true });
  await writeFile(manifestPath, renderManifest(assets, themedAssets));
  return { assets, themedAssets, sources };
}

if (import.meta.main) {
  const generated = await generateProjectPosterAssets();
  const sourceBytes = await Promise.all(generated.sources.map((source) => stat(source.sourcePath)));
  const totalBytes = sourceBytes.reduce((total, source) => total + source.size, 0);
  console.log(
    `[project-posters] generated ${generated.sources.length} source posters from ${(totalBytes / 1024 / 1024).toFixed(2)} MiB of PNG input`
  );
}
