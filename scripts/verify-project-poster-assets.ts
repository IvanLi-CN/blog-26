#!/usr/bin/env bun

import { readdir, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import sharp from "sharp";
import {
  type ProjectPosterFormat,
  type ProjectPosterWidth,
  projectPosterBudgets,
  projectPosterFormats,
  projectPosterPrioritySlugs,
  projectPosterWidths,
} from "../site/lib/project-poster-media";
import {
  discoverProjectPosterSources,
  generatedProjectPosterFileName,
  type ProjectPosterSource,
} from "./generate-project-poster-assets";

export type VerifyProjectPosterAssetsOptions = {
  sourceDir?: string;
  publicDir?: string;
  distDir?: string | null;
};

function projectRoot() {
  return resolve(import.meta.dir, "..");
}

function defaultOptions(): Required<Omit<VerifyProjectPosterAssetsOptions, "distDir">> & {
  distDir: string;
} {
  const root = projectRoot();
  return {
    sourceDir: resolve(root, "site/assets/projects/posters-source"),
    publicDir: resolve(root, "public/projects/posters"),
    distDir: resolve(root, "site-dist/projects/posters"),
  };
}

async function assertNoRawPng(directory: string) {
  const entries = await readdir(directory);
  const png = entries.find((entry) => extname(entry) === ".png");
  if (png) throw new Error(`Raw PNG poster found in ${directory}: ${png}`);
}

async function assertVariant(
  directory: string,
  source: ProjectPosterSource,
  width: ProjectPosterWidth,
  format: ProjectPosterFormat
) {
  const fileName = generatedProjectPosterFileName(source.stem, width, format);
  const filePath = join(directory, fileName);
  const [fileStats, metadata] = await Promise.all([stat(filePath), sharp(filePath).metadata()]);
  const budget = projectPosterBudgets[width][format];
  if (fileStats.size > budget) {
    throw new Error(`${fileName} is ${fileStats.size} bytes, exceeding the ${budget}-byte budget`);
  }
  if (metadata.width !== width) {
    throw new Error(`${fileName} has width ${metadata.width ?? "unknown"}, expected ${width}`);
  }
  return { fileName, size: fileStats.size };
}

async function assertInitialTransferBudget(
  publicDir: string,
  sources: ProjectPosterSource[],
  format: ProjectPosterFormat
) {
  let totalBytes = 0;
  for (const slug of projectPosterPrioritySlugs) {
    const candidates = sources.filter((source) => source.slug === slug);
    if (candidates.length === 0) {
      throw new Error(`Priority project poster is missing a source: ${slug}`);
    }
    const candidateSizes = await Promise.all(
      candidates.map(async (source) => {
        const fileName = generatedProjectPosterFileName(source.stem, 960, format);
        return (await stat(join(publicDir, fileName))).size;
      })
    );
    totalBytes += Math.max(...candidateSizes);
  }

  const budget = format === "avif" ? 750 * 1024 : 1050 * 1024;
  if (totalBytes > budget) {
    throw new Error(
      `Priority ${format} transfer is ${totalBytes} bytes, exceeding the ${budget}-byte budget`
    );
  }
  return totalBytes;
}

export async function verifyProjectPosterAssets(options: VerifyProjectPosterAssetsOptions = {}) {
  const defaults = defaultOptions();
  const sourceDir = options.sourceDir ?? defaults.sourceDir;
  const publicDir = options.publicDir ?? defaults.publicDir;
  const distDir = options.distDir === undefined ? defaults.distDir : options.distDir;
  const sources = await discoverProjectPosterSources(sourceDir);

  await assertNoRawPng(publicDir);
  const variants = await Promise.all(
    sources.flatMap((source) =>
      projectPosterFormats.flatMap((format) =>
        projectPosterWidths.map((width) => assertVariant(publicDir, source, width, format))
      )
    )
  );
  const priorityTransfers = Object.fromEntries(
    await Promise.all(
      projectPosterFormats.map(async (format) => [
        format,
        await assertInitialTransferBudget(publicDir, sources, format),
      ])
    )
  ) as Record<ProjectPosterFormat, number>;

  const hasBuiltAssets = distDir
    ? await stat(distDir)
        .then((entry) => entry.isDirectory())
        .catch(() => false)
    : false;
  if (distDir && process.env.PROJECT_POSTER_REQUIRE_DIST === "1" && !hasBuiltAssets) {
    throw new Error(`Built project poster assets are missing from ${distDir}`);
  }
  if (distDir && hasBuiltAssets) {
    await assertNoRawPng(distDir);
    await Promise.all(
      variants.map(async ({ fileName }) => {
        await stat(join(distDir, fileName));
      })
    );
  }

  return { priorityTransfers, variants };
}

if (import.meta.main) {
  const result = await verifyProjectPosterAssets();
  console.log(
    `[project-posters] verified ${result.variants.length} variants; priority AVIF ${(result.priorityTransfers.avif / 1024).toFixed(1)} KiB, WebP ${(result.priorityTransfers.webp / 1024).toFixed(1)} KiB`
  );
}
