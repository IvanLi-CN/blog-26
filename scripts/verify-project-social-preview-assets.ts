#!/usr/bin/env bun

import { readdir, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import sharp from "sharp";
import {
  type ProjectSocialPreviewFormat,
  type ProjectSocialPreviewWidth,
  projectSocialPreviewBudgets,
  projectSocialPreviewFormats,
  projectSocialPreviewWidths,
} from "../site/lib/project-social-preview-media";
import {
  discoverProjectSocialPreviewSources,
  generatedProjectSocialPreviewFileName,
  type ProjectSocialPreviewSource,
} from "./generate-project-social-preview-assets";

export type VerifyProjectSocialPreviewAssetsOptions = {
  sourceDir?: string;
  publicDir?: string;
  distDir?: string | null;
};

function projectRoot() {
  return resolve(import.meta.dir, "..");
}

function defaultOptions(): Required<Omit<VerifyProjectSocialPreviewAssetsOptions, "distDir">> & {
  distDir: string;
} {
  const root = projectRoot();
  return {
    sourceDir: resolve(root, "site/assets/projects/social-source"),
    publicDir: resolve(root, "public/projects/social"),
    distDir: resolve(root, "site-dist/projects/social"),
  };
}

async function assertNoRawPng(directory: string) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await assertNoRawPng(entryPath);
      continue;
    }
    if (entry.isFile() && extname(entry.name).toLowerCase() === ".png") {
      throw new Error(`Raw PNG social preview found in ${directory}: ${entry.name}`);
    }
  }
}

async function assertVariant(
  directory: string,
  source: ProjectSocialPreviewSource,
  width: ProjectSocialPreviewWidth,
  format: ProjectSocialPreviewFormat
) {
  const fileName = generatedProjectSocialPreviewFileName(source.stem, width, format);
  const filePath = join(directory, fileName);
  const [fileStats, metadata] = await Promise.all([stat(filePath), sharp(filePath).metadata()]);
  const budget = projectSocialPreviewBudgets[width][format];
  if (fileStats.size > budget) {
    throw new Error(`${fileName} is ${fileStats.size} bytes, exceeding the ${budget}-byte budget`);
  }
  if (metadata.width !== width) {
    throw new Error(`${fileName} has width ${metadata.width ?? "unknown"}, expected ${width}`);
  }
  return { fileName, size: fileStats.size };
}

export async function verifyProjectSocialPreviewAssets(
  options: VerifyProjectSocialPreviewAssetsOptions = {}
) {
  const defaults = defaultOptions();
  const sourceDir = options.sourceDir ?? defaults.sourceDir;
  const publicDir = options.publicDir ?? defaults.publicDir;
  const distDir = options.distDir === undefined ? defaults.distDir : options.distDir;
  const sources = await discoverProjectSocialPreviewSources(sourceDir);

  await assertNoRawPng(publicDir);
  const variants = await Promise.all(
    sources.flatMap((source) =>
      projectSocialPreviewFormats.flatMap((format) =>
        projectSocialPreviewWidths.map((width) => assertVariant(publicDir, source, width, format))
      )
    )
  );

  const hasBuiltAssets = distDir
    ? await stat(distDir)
        .then((entry) => entry.isDirectory())
        .catch(() => false)
    : false;
  if (distDir && process.env.PROJECT_SOCIAL_PREVIEW_REQUIRE_DIST === "1" && !hasBuiltAssets) {
    throw new Error(`Built project social preview assets are missing from ${distDir}`);
  }
  if (distDir && hasBuiltAssets) {
    await assertNoRawPng(distDir);
    await Promise.all(
      variants.map(async ({ fileName }) => {
        await stat(join(distDir, fileName));
      })
    );
  }

  return { variants };
}

if (import.meta.main) {
  const result = await verifyProjectSocialPreviewAssets();
  console.log(`[project-social-previews] verified ${result.variants.length} variants`);
}
