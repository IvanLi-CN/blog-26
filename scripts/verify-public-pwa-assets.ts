#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";
import {
  getPublicPwaAssetPaths,
  PUBLIC_PWA_COLORS,
  PUBLIC_PWA_SOURCE_PNG,
  PUBLIC_PWA_SOURCE_SVG,
} from "../site/lib/public-pwa";
import { APPROVED_BRAND_PNG_SHA256, APPROVED_BRAND_SVG_SHA256 } from "./generate-public-pwa-assets";

export type VerifyPublicPwaAssetsOptions = {
  root?: string;
  publicDir?: string;
  siteDistDir?: string | null;
  basePath?: string;
};

function sha256(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function normalizeBasePath(raw: string) {
  const value = raw.trim();
  if (!value || value === "/") return "";
  return `/${value.replace(/^\/+|\/+$/g, "")}`;
}

function scopePath(basePath: string, pathname: string) {
  const base = normalizeBasePath(basePath);
  return base ? (pathname === "/" ? `${base}/` : `${base}${pathname}`) : pathname;
}

async function verifyPng(path: string, size: number, mode: "transparent" | "opaque" | "maskable") {
  const metadata = await sharp(path).metadata();
  if (metadata.width !== size || metadata.height !== size) {
    throw new Error(`${path} must be ${size}x${size}; got ${metadata.width}x${metadata.height}`);
  }
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minAlpha = 255;
  let maxAlpha = 0;
  let hasForeground = false;
  const bg = [237, 244, 239];
  const center = (size - 1) / 2;
  const safeRadius = size * 0.4 + 1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const red = data[offset] ?? 0;
      const green = data[offset + 1] ?? 0;
      const blue = data[offset + 2] ?? 0;
      const alpha = data[offset + 3] ?? 0;
      minAlpha = Math.min(minAlpha, alpha);
      maxAlpha = Math.max(maxAlpha, alpha);

      if (
        alpha > 0 &&
        (Math.abs(red - bg[0]) > 8 || Math.abs(green - bg[1]) > 8 || Math.abs(blue - bg[2]) > 8)
      ) {
        hasForeground = true;
        if (mode === "maskable" && Math.hypot(x - center, y - center) > safeRadius) {
          throw new Error(`${path} has foreground outside the 80% maskable safe circle`);
        }
      }
    }
  }

  if (!hasForeground) throw new Error(`${path} does not contain a visible foreground mark`);
  if (mode === "transparent" && minAlpha !== 0)
    throw new Error(`${path} must contain transparent pixels`);
  if (mode !== "transparent" && minAlpha !== 255) throw new Error(`${path} must be fully opaque`);
  if (maxAlpha !== 255) throw new Error(`${path} must contain fully covered pixels`);

  if (mode !== "transparent") {
    const corner = [data[0], data[1], data[2]];
    if (corner.some((channel, index) => channel !== bg[index])) {
      throw new Error(`${path} must use the solid ${PUBLIC_PWA_COLORS.background} background`);
    }
  }
}

async function verifyIco(path: string) {
  const buffer = await readFile(path);
  const count = buffer.readUInt16LE(4);
  if (buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1 || count !== 3) {
    throw new Error(`${path} must contain exactly three ICO entries`);
  }

  for (const [index, expectedSize] of [16, 32, 48].entries()) {
    const start = 6 + index * 16;
    const width = buffer.readUInt8(start) || 256;
    const height = buffer.readUInt8(start + 1) || 256;
    const byteLength = buffer.readUInt32LE(start + 8);
    const offset = buffer.readUInt32LE(start + 12);
    const png = buffer.subarray(offset, offset + byteLength);
    const metadata = await sharp(png).metadata();
    if (
      width !== expectedSize ||
      height !== expectedSize ||
      metadata.width !== expectedSize ||
      metadata.height !== expectedSize
    ) {
      throw new Error(`${path} entry ${index} must decode to ${expectedSize}x${expectedSize}`);
    }
    if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
      throw new Error(`${path} entry ${index} is not an embedded PNG`);
    }

    const { data, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let minAlpha = 255;
    let maxAlpha = 0;
    for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
      const alpha = data[pixel * info.channels + 3] ?? 0;
      minAlpha = Math.min(minAlpha, alpha);
      maxAlpha = Math.max(maxAlpha, alpha);
    }
    if (minAlpha !== 0 || maxAlpha !== 255) {
      throw new Error(`${path} entry ${index} must preserve a transparent background`);
    }

    const cornerAlphas = [
      data[3],
      data[(info.width - 1) * info.channels + 3],
      data[(info.height - 1) * info.width * info.channels + 3],
      data[(info.width * info.height - 1) * info.channels + 3],
    ];
    if (cornerAlphas.some((alpha) => alpha !== 0)) {
      throw new Error(`${path} entry ${index} corners must remain transparent`);
    }
  }
}

async function verifyBuiltSite(
  root: string,
  siteDistDir: string,
  basePath: string,
  assets: Awaited<ReturnType<typeof getPublicPwaAssetPaths>>
) {
  const manifestPath = join(siteDistDir, "site.webmanifest");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    id?: string;
    start_url?: string;
    scope?: string;
    name?: string;
    short_name?: string;
    display?: string;
    background_color?: string;
    theme_color?: string;
    icons?: { src: string; sizes: string; type: string; purpose?: string }[];
  };
  const publicRoot = scopePath(basePath, "/");
  for (const [key, value] of Object.entries({
    id: publicRoot,
    start_url: publicRoot,
    scope: publicRoot,
    name: "Ivan's Blog",
    short_name: "Ivan's Blog",
    display: "standalone",
    background_color: PUBLIC_PWA_COLORS.background,
    theme_color: PUBLIC_PWA_COLORS.background,
  })) {
    if (manifest[key as keyof typeof manifest] !== value) {
      throw new Error(`site.webmanifest ${key} must be ${JSON.stringify(value)}`);
    }
  }

  const expectedIcons = [
    [assets.any192, "192x192", "any"],
    [assets.any512, "512x512", "any"],
    [assets.maskable192, "192x192", "maskable"],
    [assets.maskable512, "512x512", "maskable"],
  ] as const;
  for (const [path, size, purpose] of expectedIcons) {
    const source = scopePath(basePath, path);
    const item = manifest.icons?.find((icon) => icon.src === source);
    if (!item || item.sizes !== size || item.type !== "image/png" || item.purpose !== purpose) {
      throw new Error(`Manifest is missing ${purpose} ${size} icon ${source}`);
    }
    const physicalPath = path.replace(/^\//, "");
    await access(join(siteDistDir, physicalPath));
  }

  const html = await readFile(join(siteDistDir, "index.html"), "utf8");
  const expectedLinks = [
    scopePath(basePath, "/site.webmanifest"),
    scopePath(basePath, assets.faviconSvg),
    scopePath(basePath, assets.faviconIco),
    scopePath(basePath, assets.appleTouch180),
  ];
  for (const link of expectedLinks) {
    if (!html.includes(`href="${link}"`)) throw new Error(`Homepage does not link ${link}`);
  }
  if (
    html.includes("serviceWorker.register") ||
    /(?:^|\/)service-worker\.js(?:["'?]|$)/.test(html)
  ) {
    throw new Error("Public PWA must not register or publish a Service Worker");
  }

  const entries = await readdir(siteDistDir, { recursive: true });
  if (
    entries.some((entry) =>
      /^(?:sw|service-worker)\.js$/i.test(String(entry).split(/[\\/]/).at(-1) ?? "")
    )
  ) {
    throw new Error("Public PWA build must not contain a Service Worker file");
  }
  void root;
}

export async function verifyPublicPwaAssets(options: VerifyPublicPwaAssetsOptions = {}) {
  const root = resolve(options.root ?? process.cwd());
  const publicDir = resolve(options.publicDir ?? join(root, "public"));
  const [svg, png] = await Promise.all([
    readFile(resolve(root, PUBLIC_PWA_SOURCE_SVG)),
    readFile(resolve(root, PUBLIC_PWA_SOURCE_PNG)),
  ]);
  if (sha256(svg) !== APPROVED_BRAND_SVG_SHA256)
    throw new Error("Approved SVG source hash changed");
  if (sha256(png) !== APPROVED_BRAND_PNG_SHA256)
    throw new Error("Approved IB-M17-01 image hash changed");
  if (!(await readFile(join(publicDir, "ivan-blog-mark.svg"))).equals(svg)) {
    throw new Error("Public SVG mark must be byte-identical to the approved source");
  }

  const assets = await getPublicPwaAssetPaths(root);
  if (!/^[a-f0-9]{16}$/.test(assets.version))
    throw new Error("PWA asset version must be a 16-character digest");
  const iconDir = join(publicDir, assets.publicDirectory.slice(1));
  await Promise.all([
    verifyPng(join(iconDir, "icon-any-192.png"), 192, "transparent"),
    verifyPng(join(iconDir, "icon-any-512.png"), 512, "transparent"),
    verifyPng(join(iconDir, "icon-maskable-192.png"), 192, "maskable"),
    verifyPng(join(iconDir, "icon-maskable-512.png"), 512, "maskable"),
    verifyPng(join(iconDir, "apple-touch-icon-180.png"), 180, "opaque"),
    verifyIco(join(publicDir, "favicon.ico")),
  ]);

  const [any192, maskable192, apple180, faviconSvg] = await Promise.all([
    readFile(join(iconDir, "icon-any-192.png")),
    readFile(join(iconDir, "icon-maskable-192.png")),
    readFile(join(iconDir, "apple-touch-icon-180.png")),
    readFile(join(publicDir, "favicon.svg"), "utf8"),
  ]);
  if (any192.equals(maskable192) || maskable192.equals(apple180)) {
    throw new Error("Transparent, maskable, and Apple icon assets must remain separate files");
  }
  if (!faviconSvg.includes("prefers-color-scheme:dark") || !faviconSvg.includes("currentColor")) {
    throw new Error("SVG favicon must adapt its foreground to the browser color scheme");
  }

  let siteDistDir = options.siteDistDir;
  if (siteDistDir === undefined) {
    const defaultDist = join(root, "site-dist");
    siteDistDir = await stat(defaultDist)
      .then(() => defaultDist)
      .catch(() => null);
  }
  if (siteDistDir) {
    const basePath = options.basePath ?? process.env.PUBLIC_SITE_BASE_PATH ?? "";
    await verifyBuiltSite(root, resolve(siteDistDir), basePath, assets);
  }

  return assets;
}

if (import.meta.main) {
  verifyPublicPwaAssets()
    .then((assets) => console.log(`Verified public PWA assets: ${assets.publicDirectory}`))
    .catch((error) => {
      console.error(
        "[verify-public-pwa-assets]",
        error instanceof Error ? error.message : String(error)
      );
      process.exitCode = 1;
    });
}
