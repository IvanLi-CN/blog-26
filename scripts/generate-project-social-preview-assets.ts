#!/usr/bin/env bun

import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import sharp from "sharp";
import {
  type ProjectSocialPreviewAsset,
  type ProjectSocialPreviewFormat,
  type ProjectSocialPreviewTheme,
  type ProjectSocialPreviewThemedAsset,
  type ProjectSocialPreviewWidth,
  projectSocialPreviewBudgets,
  projectSocialPreviewFormats,
  projectSocialPreviewPlaceholderMaxBytes,
  projectSocialPreviewWidths,
} from "../site/lib/project-social-preview-media";

const SOURCE_THEME_PATTERN = /^(?<slug>.+)-(?:light|dark)$/;
const GENERATED_SOCIAL_PREVIEW_PATTERN = /-\d+\.(?:avif|webp)$/;

export type ProjectSocialPreviewSource = {
  sourcePath: string;
  stem: string;
  slug: string;
  theme: ProjectSocialPreviewTheme | null;
};

export type GenerateProjectSocialPreviewAssetsOptions = {
  sourceDir?: string;
  outputDir?: string;
  manifestPath?: string;
};

export type GeneratedProjectSocialPreviewAssets = {
  assets: Record<string, ProjectSocialPreviewAsset>;
  themedAssets: Record<string, ProjectSocialPreviewThemedAsset>;
  sources: ProjectSocialPreviewSource[];
};

function projectRoot() {
  return resolve(import.meta.dir, "..");
}

function defaultOptions(): Required<GenerateProjectSocialPreviewAssetsOptions> {
  const root = projectRoot();
  return {
    sourceDir: resolve(root, "site/assets/projects/social-source"),
    outputDir: resolve(root, "public/projects/social"),
    manifestPath: resolve(root, "site/generated/project-social-preview-assets.ts"),
  };
}

function inferSourceIdentity(
  fileName: string
): Pick<ProjectSocialPreviewSource, "stem" | "slug" | "theme"> {
  const stem = basename(fileName, extname(fileName));
  const match = stem.match(SOURCE_THEME_PATTERN);
  if (!match?.groups?.slug) return { stem, slug: stem, theme: null };

  const theme = stem.endsWith("-dark") ? "dark" : "light";
  return { stem, slug: match.groups.slug, theme };
}

export async function discoverProjectSocialPreviewSources(
  sourceDir: string
): Promise<ProjectSocialPreviewSource[]> {
  const entries = (await readdir(sourceDir)).filter((entry) => extname(entry) === ".png").sort();
  if (entries.length === 0) {
    throw new Error(`No PNG social preview sources found in ${sourceDir}`);
  }

  return entries.map((fileName) => ({
    sourcePath: join(sourceDir, fileName),
    ...inferSourceIdentity(fileName),
  }));
}

export function generatedProjectSocialPreviewFileName(
  stem: string,
  width: ProjectSocialPreviewWidth,
  format: ProjectSocialPreviewFormat
) {
  return `${stem}-${width}.${format}`;
}

async function assertNoPublicSourcePng(outputDir: string) {
  const entries = await readdir(outputDir, { withFileTypes: true }).catch(
    () => [] as Awaited<ReturnType<typeof readdir>>
  );
  for (const entry of entries) {
    const entryPath = join(outputDir, entry.name);
    if (entry.isDirectory()) {
      await assertNoPublicSourcePng(entryPath);
      continue;
    }
    if (entry.isFile() && extname(entry.name).toLowerCase() === ".png") {
      throw new Error(`Raw PNG social preview must not remain in ${outputDir}: ${entry.name}`);
    }
  }
}

async function clearGeneratedSocialPreviewFiles(outputDir: string) {
  const entries = await readdir(outputDir).catch(() => [] as string[]);
  await Promise.all(
    entries
      .filter((entry) => GENERATED_SOCIAL_PREVIEW_PATTERN.test(entry))
      .map((entry) => unlink(join(outputDir, entry)))
  );
}

async function encodeWithinBudget(
  sourcePath: string,
  format: ProjectSocialPreviewFormat,
  width: ProjectSocialPreviewWidth
) {
  const budget = projectSocialPreviewBudgets[width][format];
  const startQuality = format === "avif" ? 55 : 72;
  const minimumQuality = format === "avif" ? 35 : 50;

  for (let quality = startQuality; quality >= minimumQuality; quality -= 1) {
    const pipeline = sharp(sourcePath).rotate().resize({ width, withoutEnlargement: true });
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
  source: ProjectSocialPreviewSource,
  outputDir: string
): Promise<ProjectSocialPreviewAsset> {
  const sourceMetadata = await sharp(source.sourcePath).rotate().metadata();
  if (!sourceMetadata.width || !sourceMetadata.height || sourceMetadata.width < 1280) {
    throw new Error(`${basename(source.sourcePath)} must be at least 1280px wide`);
  }

  const sources = {} as ProjectSocialPreviewAsset["sources"];
  for (const format of projectSocialPreviewFormats) {
    const variants = {} as Record<ProjectSocialPreviewWidth, string>;
    for (const width of projectSocialPreviewWidths) {
      const outputName = generatedProjectSocialPreviewFileName(source.stem, width, format);
      const outputPath = join(outputDir, outputName);
      const buffer = await encodeWithinBudget(source.sourcePath, format, width);
      await writeFile(outputPath, buffer);
      variants[width] = `/projects/social/${outputName}`;
    }
    sources[format] = variants;
  }

  const displayBuffer = await sharp(source.sourcePath)
    .rotate()
    .resize({ width: 1280, withoutEnlargement: true })
    .webp({ quality: 72, effort: 4 })
    .toBuffer();
  const displayMetadata = await sharp(displayBuffer).metadata();
  if (!displayMetadata.width || !displayMetadata.height) {
    throw new Error(`${basename(source.sourcePath)} has no display dimensions`);
  }

  const placeholderBuffer = await sharp(source.sourcePath)
    .rotate()
    .resize({ width: 32, withoutEnlargement: true })
    .webp({ quality: 35, effort: 4 })
    .toBuffer();
  if (placeholderBuffer.byteLength > projectSocialPreviewPlaceholderMaxBytes) {
    throw new Error(`${basename(source.sourcePath)} low-quality preview exceeds 2 KiB`);
  }

  return {
    width: displayMetadata.width,
    height: displayMetadata.height,
    placeholder: `data:image/webp;base64,${placeholderBuffer.toString("base64")}`,
    sources,
  };
}

function renderManifest(
  assets: Record<string, ProjectSocialPreviewAsset>,
  themedAssets: Record<string, ProjectSocialPreviewThemedAsset>
) {
  return [
    'import type { ProjectSocialPreviewAsset, ProjectSocialPreviewThemedAsset } from "../lib/project-social-preview-media";',
    "",
    `export const projectSocialPreviewAssets: Record<string, ProjectSocialPreviewAsset> = ${JSON.stringify(assets, null, 2)};`,
    "",
    `export const projectSocialPreviewThemedAssets: Record<string, ProjectSocialPreviewThemedAsset> = ${JSON.stringify(themedAssets, null, 2)};`,
    "",
  ].join("\n");
}

export async function generateProjectSocialPreviewAssets(
  options: GenerateProjectSocialPreviewAssetsOptions = {}
): Promise<GeneratedProjectSocialPreviewAssets> {
  const defaults = defaultOptions();
  const sourceDir = options.sourceDir ?? defaults.sourceDir;
  const outputDir = options.outputDir ?? defaults.outputDir;
  const manifestPath = options.manifestPath ?? defaults.manifestPath;
  const sources = await discoverProjectSocialPreviewSources(sourceDir);

  await mkdir(outputDir, { recursive: true });
  await assertNoPublicSourcePng(outputDir);
  await clearGeneratedSocialPreviewFiles(outputDir);

  const assets: Record<string, ProjectSocialPreviewAsset> = {};
  const themedDrafts: Record<string, Partial<ProjectSocialPreviewThemedAsset>> = {};
  for (const source of sources) {
    const asset = await generateAsset(source, outputDir);
    if (source.theme) {
      themedDrafts[source.slug] ??= {};
      themedDrafts[source.slug][source.theme] = asset;
    } else {
      assets[source.slug] = asset;
    }
  }

  const themedAssets: Record<string, ProjectSocialPreviewThemedAsset> = {};
  for (const [slug, draft] of Object.entries(themedDrafts)) {
    if (!draft.light || !draft.dark) {
      throw new Error(
        `Themed project social preview ${slug} must provide both light and dark PNG sources`
      );
    }
    themedAssets[slug] = { light: draft.light, dark: draft.dark };
  }

  await mkdir(resolve(manifestPath, ".."), { recursive: true });
  await writeFile(manifestPath, renderManifest(assets, themedAssets));
  return { assets, themedAssets, sources };
}

if (import.meta.main) {
  const generated = await generateProjectSocialPreviewAssets();
  const sourceBytes = await Promise.all(generated.sources.map((source) => stat(source.sourcePath)));
  const totalBytes = sourceBytes.reduce((total, source) => total + source.size, 0);
  console.log(
    `[project-social-previews] generated ${generated.sources.length} source previews from ${(totalBytes / 1024 / 1024).toFixed(2)} MiB of PNG input`
  );
}
