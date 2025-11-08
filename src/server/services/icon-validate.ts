const ICON_BASE = process.env.ICONIFY_BASE || "https://api.iconify.design";
const TTL = Number(process.env.ICONIFY_VALIDATE_TTL || 86400);

type CacheEntry = { ok: boolean; ts: number };
const cache = new Map<string, CacheEntry>();

// @ts-expect-error Iconify JSON modules lack TypeScript declarations.
import bxl from "@iconify-json/bxl/icons.json";
// @ts-expect-error Iconify JSON modules lack TypeScript declarations.
import carbon from "@iconify-json/carbon/icons.json";
// @ts-expect-error Iconify JSON modules lack TypeScript declarations.
import cib from "@iconify-json/cib/icons.json";
// @ts-expect-error Iconify JSON modules lack TypeScript declarations.
import fa6brands from "@iconify-json/fa6-brands/icons.json";
// @ts-expect-error Iconify JSON modules lack TypeScript declarations.
import gameIcons from "@iconify-json/game-icons/icons.json";
// @ts-expect-error Iconify JSON modules lack TypeScript declarations.
import lineMd from "@iconify-json/line-md/icons.json";
// @ts-expect-error Iconify JSON modules lack TypeScript declarations.
import materialSymbols from "@iconify-json/material-symbols/icons.json";
// Local existence index for allowed single-color sets to avoid network flakiness
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error Iconify JSON modules lack TypeScript declarations.
import simpleIcons from "@iconify-json/simple-icons/icons.json";
// @ts-expect-error Iconify JSON modules lack TypeScript declarations.
import tabler from "@iconify-json/tabler/icons.json";

function buildIndex(): Record<string, Set<string>> {
  const toSet = (pkg: any) => new Set(Object.keys(pkg?.icons || {}));
  return {
    "simple-icons": toSet(simpleIcons),
    tabler: toSet(tabler),
    "line-md": toSet(lineMd),
    carbon: toSet(carbon),
    cib: toSet(cib),
    "fa6-brands": toSet(fa6brands),
    bxl: toSet(bxl),
    "material-symbols": toSet(materialSymbols),
    "game-icons": toSet(gameIcons),
  };
}

const LOCAL_INDEX = buildIndex();

function localExists(id: string): boolean {
  const [prefix, name] = id.split(":");
  const set = LOCAL_INDEX[prefix];
  return !!set && set.has(name);
}

export async function validateIconExists(id: string): Promise<boolean> {
  const hit = cache.get(id);
  const now = Date.now();
  if (hit && now - hit.ts < TTL * 1000) return hit.ok;

  // Prefer local check when available to avoid network dependency
  if (localExists(id)) {
    cache.set(id, { ok: true, ts: now });
    return true;
  }

  try {
    const res = await fetch(`${ICON_BASE}/${encodeURIComponent(id)}.svg`, { method: "HEAD" });
    const ok = res.ok;
    cache.set(id, { ok, ts: now });
    return ok;
  } catch {
    cache.set(id, { ok: false, ts: now });
    return false;
  }
}

export function invalidateIconCache(id?: string) {
  if (id) cache.delete(id);
  else cache.clear();
}
