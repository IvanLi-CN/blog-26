#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";
import {
  getPublicPwaAssetPaths,
  PUBLIC_PWA_COLORS,
  PUBLIC_PWA_ICON_CONTRACT,
  PUBLIC_PWA_SOURCE_PNG,
  PUBLIC_PWA_SOURCE_SVG,
} from "../site/lib/public-pwa";

export const APPROVED_BRAND_SVG_SHA256 =
  "6f7702a37c2b2510dda09503ba55b3eb2cf2b8f5d8dc63aec8e8060ec4228710";
export const APPROVED_BRAND_PNG_SHA256 =
  "922b43ef7b0a0328886132b1815c101f0aa037f80793d5ed14c56c527fabe06d";

export type GeneratePublicPwaAssetsOptions = {
  root?: string;
  publicDir?: string;
};

function sha256(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertApprovedSources(svg: Buffer, png: Buffer) {
  if (sha256(svg) !== APPROVED_BRAND_SVG_SHA256) {
    throw new Error(
      "Approved brand SVG source changed; review and explicitly update the master hash."
    );
  }
  if (sha256(png) !== APPROVED_BRAND_PNG_SHA256) {
    throw new Error(
      "Approved IB-M17-01 image changed; review and explicitly update the master hash."
    );
  }
}

function numberText(value: number) {
  return Number(value.toFixed(4)).toString();
}

export function buildIconSvg(
  sourceSvg: string,
  size: number,
  markWidthRatio: number,
  foreground: string,
  background: string | null
) {
  const sourceOpenTag =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="110 226 796 572" fill="#000">';
  if (!sourceSvg.startsWith(sourceOpenTag) || !sourceSvg.trimEnd().endsWith("</svg>")) {
    throw new Error("Brand SVG does not match the approved two-path vector master structure.");
  }

  const markWidth = size * markWidthRatio;
  const markHeight = (markWidth * 572) / 796;
  const x = (size - markWidth) / 2;
  const y = (size - markHeight) / 2;
  const nestedSvg = sourceSvg.replace(
    sourceOpenTag,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="110 226 796 572" x="${numberText(x)}" y="${numberText(y)}" width="${numberText(markWidth)}" height="${numberText(markHeight)}" fill="${foreground}">`
  );
  const backgroundLayer = background
    ? `<rect width="${size}" height="${size}" fill="${background}"/>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${backgroundLayer}${nestedSvg}</svg>`;
}

export function buildAdaptiveFaviconSvg(sourceSvg: string) {
  const sourceOpenTag =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="110 226 796 572" fill="#000">';
  if (!sourceSvg.startsWith(sourceOpenTag)) {
    throw new Error("Brand SVG does not match the approved vector master.");
  }
  return sourceSvg.replace(
    sourceOpenTag,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="110 226 796 572" fill="currentColor"><style>:root{color:${PUBLIC_PWA_COLORS.foreground}}@media(prefers-color-scheme:dark){:root{color:${PUBLIC_PWA_COLORS.darkThemeForeground}}}</style>`
  );
}

export function createIco(pngs: readonly { size: number; buffer: Buffer }[]) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);

  let offset = header.length;
  const chunks = [header];
  for (const [index, entry] of pngs.entries()) {
    const start = 6 + index * 16;
    header.writeUInt8(entry.size === 256 ? 0 : entry.size, start);
    header.writeUInt8(entry.size === 256 ? 0 : entry.size, start + 1);
    header.writeUInt8(0, start + 2);
    header.writeUInt8(0, start + 3);
    header.writeUInt16LE(1, start + 4);
    header.writeUInt16LE(32, start + 6);
    header.writeUInt32LE(entry.buffer.byteLength, start + 8);
    header.writeUInt32LE(offset, start + 12);
    chunks.push(entry.buffer);
    offset += entry.buffer.byteLength;
  }

  return Buffer.concat(chunks);
}

async function renderPng(svg: string) {
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

export async function generatePublicPwaAssets(options: GeneratePublicPwaAssetsOptions = {}) {
  const root = resolve(options.root ?? process.cwd());
  const publicDir = resolve(options.publicDir ?? resolve(root, "public"));
  const [svgBuffer, pngBuffer] = await Promise.all([
    readFile(resolve(root, PUBLIC_PWA_SOURCE_SVG)),
    readFile(resolve(root, PUBLIC_PWA_SOURCE_PNG)),
  ]);
  assertApprovedSources(svgBuffer, pngBuffer);

  const sourceSvg = svgBuffer.toString("utf8");
  const paths = await getPublicPwaAssetPaths(root);
  const versionedDir = resolve(publicDir, paths.publicDirectory.slice(1));
  await mkdir(versionedDir, { recursive: true });

  const any192 = await renderPng(
    buildIconSvg(
      sourceSvg,
      192,
      PUBLIC_PWA_ICON_CONTRACT.any.markWidth,
      PUBLIC_PWA_COLORS.foreground,
      null
    )
  );
  const any512 = await renderPng(
    buildIconSvg(
      sourceSvg,
      512,
      PUBLIC_PWA_ICON_CONTRACT.any.markWidth,
      PUBLIC_PWA_COLORS.foreground,
      null
    )
  );
  const maskable192 = await renderPng(
    buildIconSvg(
      sourceSvg,
      192,
      PUBLIC_PWA_ICON_CONTRACT.maskable.markWidth,
      PUBLIC_PWA_COLORS.foreground,
      PUBLIC_PWA_COLORS.background
    )
  );
  const maskable512 = await renderPng(
    buildIconSvg(
      sourceSvg,
      512,
      PUBLIC_PWA_ICON_CONTRACT.maskable.markWidth,
      PUBLIC_PWA_COLORS.foreground,
      PUBLIC_PWA_COLORS.background
    )
  );
  const apple180 = await renderPng(
    buildIconSvg(
      sourceSvg,
      180,
      PUBLIC_PWA_ICON_CONTRACT.apple.markWidth,
      PUBLIC_PWA_COLORS.foreground,
      PUBLIC_PWA_COLORS.background
    )
  );
  const faviconPngs = await Promise.all(
    PUBLIC_PWA_ICON_CONTRACT.favicon.sizes.map(async (size) => ({
      size,
      buffer: await renderPng(
        buildIconSvg(
          sourceSvg,
          size,
          PUBLIC_PWA_ICON_CONTRACT.favicon.markWidth,
          PUBLIC_PWA_COLORS.foreground,
          PUBLIC_PWA_ICON_CONTRACT.favicon.background
        )
      ),
    }))
  );

  const generatedFiles = [
    [resolve(versionedDir, "icon-any-192.png"), any192],
    [resolve(versionedDir, "icon-any-512.png"), any512],
    [resolve(versionedDir, "icon-maskable-192.png"), maskable192],
    [resolve(versionedDir, "icon-maskable-512.png"), maskable512],
    [resolve(versionedDir, "apple-touch-icon-180.png"), apple180],
    [resolve(publicDir, "favicon.svg"), Buffer.from(buildAdaptiveFaviconSvg(sourceSvg))],
    [resolve(publicDir, "favicon.ico"), createIco(faviconPngs)],
    [resolve(publicDir, "ivan-blog-mark.svg"), svgBuffer],
  ] as const;

  await Promise.all(
    generatedFiles.map(async ([path, contents]) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, contents);
    })
  );

  return paths;
}

if (import.meta.main) {
  generatePublicPwaAssets()
    .then((assets) => {
      console.log(`Generated public PWA assets: ${assets.publicDirectory}`);
    })
    .catch((error) => {
      console.error(
        "[generate-public-pwa-assets]",
        error instanceof Error ? error.message : String(error)
      );
      process.exitCode = 1;
    });
}
