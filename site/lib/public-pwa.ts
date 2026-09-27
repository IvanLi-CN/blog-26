import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const PUBLIC_PWA_COLORS = {
  foreground: "#24352d",
  background: "#edf4ef",
  darkThemeForeground: "#e9f1eb",
} as const;

export const PUBLIC_PWA_ICON_CONTRACT = {
  version: 1,
  colors: PUBLIC_PWA_COLORS,
  any: { sizes: [192, 512], markWidth: 0.72, background: null },
  maskable: { sizes: [192, 512], markWidth: 0.6, background: PUBLIC_PWA_COLORS.background },
  apple: { size: 180, markWidth: 0.6, background: PUBLIC_PWA_COLORS.background },
  favicon: { sizes: [16, 32, 48], markWidth: 0.72, background: null },
} as const;

export const PUBLIC_PWA_SOURCE_SVG = "site/assets/brand/source/ivan-blog-mark.svg";
export const PUBLIC_PWA_SOURCE_PNG = "site/assets/brand/source/ib-m17-01.png";

export type PublicPwaAssetPaths = {
  version: string;
  publicDirectory: string;
  faviconSvg: string;
  faviconIco: string;
  any192: string;
  any512: string;
  maskable192: string;
  maskable512: string;
  appleTouch180: string;
};

export async function getPublicPwaAssetPaths(root = process.cwd()): Promise<PublicPwaAssetPaths> {
  const source = await readFile(resolve(root, PUBLIC_PWA_SOURCE_SVG));
  const version = createHash("sha256")
    .update(source)
    .update("\0")
    .update(JSON.stringify(PUBLIC_PWA_ICON_CONTRACT))
    .digest("hex")
    .slice(0, 16);
  const publicDirectory = `/pwa/${version}`;

  return {
    version,
    publicDirectory,
    faviconSvg: "/favicon.svg",
    faviconIco: "/favicon.ico",
    any192: `${publicDirectory}/icon-any-192.png`,
    any512: `${publicDirectory}/icon-any-512.png`,
    maskable192: `${publicDirectory}/icon-maskable-192.png`,
    maskable512: `${publicDirectory}/icon-maskable-512.png`,
    appleTouch180: `${publicDirectory}/apple-touch-icon-180.png`,
  };
}

export function createPublicWebManifest(
  assets: PublicPwaAssetPaths,
  toPublicSitePath: (path: string) => string | null | undefined
) {
  const resolvePath = (path: string) => {
    const resolved = toPublicSitePath(path);
    if (!resolved) throw new Error(`Could not resolve public PWA path: ${path}`);
    return resolved;
  };
  const publicRoot = resolvePath("/");

  return {
    id: publicRoot,
    name: "Ivan's Blog",
    short_name: "Ivan's Blog",
    description: "记录技术探索、生活感悟和创意想法的个人空间",
    start_url: publicRoot,
    scope: publicRoot,
    display: "standalone",
    background_color: PUBLIC_PWA_COLORS.background,
    theme_color: PUBLIC_PWA_COLORS.background,
    lang: "zh-CN",
    icons: [
      { src: resolvePath(assets.any192), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: resolvePath(assets.any512), sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: resolvePath(assets.maskable192),
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: resolvePath(assets.maskable512),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  } as const;
}
