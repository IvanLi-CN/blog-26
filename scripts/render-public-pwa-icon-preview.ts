#!/usr/bin/env bun

import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";
import { getPublicPwaAssetPaths } from "../site/lib/public-pwa";

const root = resolve(import.meta.dir, "..");
const assets = await getPublicPwaAssetPaths(root);
const iconDir = resolve(root, "public", assets.publicDirectory.slice(1));
const outputPath = resolve(root, "docs/specs/public-pwa/assets/icon-preview.png");
const canvasWidth = 1280;
const canvasHeight = 720;
const background = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}"><rect width="100%" height="100%" fill="#f8fbf8"/><path d="M0 342H${canvasWidth}V343H0Z" fill="#d8e2db"/><style>text{font-family:Arial,sans-serif;letter-spacing:0}</style><text x="36" y="45" font-size="23" font-weight="700" fill="#24352d">Browser and install assets</text><text x="36" y="83" font-size="16" fill="#55675d">Transparent, solid, and platform-cropped previews</text><text x="38" y="126" font-size="16" fill="#55675d">Light browser surface</text><text x="38" y="378" font-size="16" fill="#24352d">Any purpose: transparent background</text><text x="660" y="378" font-size="16" fill="#24352d">Maskable: platform circle crop</text><text x="38" y="680" font-size="14" fill="#55675d">IB-M17-01 derived from the approved vector source</text></svg>`
);
const layers: sharp.OverlayOptions[] = [{ input: background, left: 0, top: 0 }];
const darkBrowserSurface = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="730" height="215"><rect width="100%" height="100%" fill="#2f2f30"/><text x="20" y="26" font-family="Arial,sans-serif" font-size="16" fill="#e9f1eb">Dark browser surface</text></svg>'
);
layers.push({ input: darkBrowserSurface, left: 520, top: 100 });

async function addImage(
  path: string,
  left: number,
  top: number,
  width: number,
  fit: "contain" | "cover" = "contain"
) {
  const image = await sharp(path)
    .resize(width, width, { fit, background: "#edf4ef" })
    .png()
    .toBuffer();
  layers.push({ input: image, left, top });
}

async function addLabel(text: string, left: number, top: number, color: string, size = 14) {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="28"><text x="0" y="20" font-family="Arial,sans-serif" font-size="${size}" fill="${color}">${text}</text></svg>`
  );
  layers.push({ input: svg, left, top });
}

async function addTransparencyTile(left: number, top: number, size: number) {
  const checker = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><pattern id="checker" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#e4eae6"/><rect x="8" y="8" width="8" height="8" fill="#e4eae6"/><rect x="8" y="0" width="8" height="8" fill="#fff"/><rect x="0" y="8" width="8" height="8" fill="#fff"/></pattern></defs><rect width="100%" height="100%" fill="url(#checker)"/></svg>`
  );
  layers.push({ input: checker, left, top });
}

const lightFavicon = await readFile(resolve(root, "public/site-assets/favicon.ico"));
const darkFavicon = await readFile(resolve(root, "public/site-assets/favicon-dark.ico"));
for (const [index, size] of [16, 32, 48].entries()) {
  const offset = 6 + index * 16;
  await addTransparencyTile(42 + index * 150, 145, 96);
  for (const [favicon, left] of [
    [lightFavicon, 42 + index * 150],
    [darkFavicon, 560 + index * 150],
  ] as const) {
    const length = favicon.readUInt32LE(offset + 8);
    const start = favicon.readUInt32LE(offset + 12);
    const png = favicon.subarray(start, start + length);
    const preview = await sharp(png).resize(96, 96, { kernel: "nearest" }).png().toBuffer();
    layers.push({ input: preview, left, top: 145 });
  }
  await addLabel(`${size}px ICO`, 48 + index * 150, 245, "#24352d");
  await addLabel(`${size}px ICO`, 566 + index * 150, 245, "#e9f1eb");
}

const any192 = resolve(iconDir, "icon-any-192.png");
const any512 = resolve(iconDir, "icon-any-512.png");
const maskable192 = resolve(iconDir, "icon-maskable-192.png");
const maskable512 = resolve(iconDir, "icon-maskable-512.png");
const apple180 = resolve(iconDir, "apple-touch-icon-180.png");

await addTransparencyTile(38, 408, 192);
await addTransparencyTile(265, 408, 192);
await addImage(any192, 38, 408, 192);
await addLabel("192px", 105, 608, "#24352d");
await addImage(any512, 265, 408, 192);
await addLabel("512px", 335, 608, "#24352d");
await addImage(apple180, 490, 408, 192);
await addLabel("Apple 180px", 535, 608, "#24352d");
await addImage(maskable192, 710, 408, 192);
await addLabel("Maskable 192px", 725, 608, "#24352d");

const circleMask = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192"><circle cx="96" cy="96" r="76.8" fill="#fff"/></svg>'
);
const circleCropped = await sharp(maskable512)
  .resize(192, 192)
  .composite([{ input: circleMask, blend: "dest-in" }])
  .png()
  .toBuffer();
layers.push({ input: circleCropped, left: 990, top: 408 });
await addLabel("80% safe circle", 985, 608, "#24352d");

await mkdir(dirname(outputPath), { recursive: true });
await sharp({
  create: { width: canvasWidth, height: canvasHeight, channels: 4, background: "#f8fbf8" },
})
  .composite(layers)
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
console.log(`Rendered public PWA icon preview: ${outputPath}`);
