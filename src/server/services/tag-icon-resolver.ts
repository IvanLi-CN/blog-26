import { inArray, sql } from "drizzle-orm";
import { db, initializeDB } from "@/lib/db";
import { getAllowedPrefixes, isValidIconId } from "@/lib/icons/aliases";
import { tags as tagsTable } from "@/lib/schema";

type TagIconRow = {
  id: string;
  icon: string | null;
};

async function ensureDB(): Promise<void> {
  if (!db) {
    await initializeDB();
  }
  if (!db) {
    throw new Error("DB not initialized");
  }
}

function normalizeRequestedTagPath(raw: string): { tagPath: string; leaf: string } | null {
  const cleaned = (raw ?? "")
    .trim()
    // tags may come with a leading "#", e.g. "#DevOps/Network"
    .replace(/^#+/, "");

  const segments = cleaned
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) return null;

  const tagPath = segments.join("/");
  const leaf = segments[segments.length - 1];
  return { tagPath, leaf };
}

function compareLex(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function sanitizeIconId(
  iconId: string | null,
  allowedPrefixes: ReadonlySet<string>
): string | null {
  const trimmed = iconId?.trim();
  if (!trimmed) return null;
  if (!isValidIconId(trimmed)) return null;
  const prefix = trimmed.slice(0, trimmed.indexOf(":"));
  if (!allowedPrefixes.has(prefix)) return null;
  return trimmed;
}

function pickBestIconForLowerId(
  rows: TagIconRow[],
  allowedPrefixes: ReadonlySet<string>
): string | null {
  let best: { id: string; icon: string } | null = null;

  for (const row of rows) {
    const icon = sanitizeIconId(row.icon, allowedPrefixes);
    if (!icon) continue;

    if (!best || compareLex(row.id, best.id) < 0) {
      best = { id: row.id, icon };
    }
  }

  return best?.icon ?? null;
}

export async function resolveTagIconsForTags(
  tags: string[]
): Promise<Record<string, string | null>> {
  const normalized = new Map<string, { tagPath: string; leaf: string }>();
  for (const raw of tags) {
    const value = normalizeRequestedTagPath(String(raw));
    if (!value) continue;
    normalized.set(value.tagPath, value);
  }

  if (normalized.size === 0) return {};

  await ensureDB();

  const requests = Array.from(normalized.values());
  const exactIdsSet = new Set<string>();
  const lowerIdsSet = new Set<string>();

  for (const req of requests) {
    exactIdsSet.add(req.tagPath);
    exactIdsSet.add(req.leaf);
    lowerIdsSet.add(req.tagPath.toLowerCase());
    lowerIdsSet.add(req.leaf.toLowerCase());
  }

  const exactIds = Array.from(exactIdsSet);
  const lowerIds = Array.from(lowerIdsSet);

  const exactRows =
    exactIds.length === 0
      ? []
      : await db
          .select({ id: tagsTable.id, icon: tagsTable.icon })
          .from(tagsTable)
          .where(inArray(tagsTable.id, exactIds));

  const exactById = new Map<string, TagIconRow>();
  for (const row of exactRows) {
    exactById.set(row.id, row);
  }

  const ciRows =
    lowerIds.length === 0
      ? []
      : await db
          .select({ id: tagsTable.id, icon: tagsTable.icon })
          .from(tagsTable)
          .where(inArray(sql`lower(${tagsTable.id})`, lowerIds));

  const rowsByLowerId = new Map<string, TagIconRow[]>();
  for (const row of ciRows) {
    const key = row.id.toLowerCase();
    const existing = rowsByLowerId.get(key);
    if (existing) {
      existing.push(row);
    } else {
      rowsByLowerId.set(key, [row]);
    }
  }

  const allowedPrefixes = new Set(getAllowedPrefixes());
  const bestIconByLowerId = new Map<string, string | null>();
  for (const [lowerId, rows] of rowsByLowerId) {
    bestIconByLowerId.set(lowerId, pickBestIconForLowerId(rows, allowedPrefixes));
  }

  const out: Record<string, string | null> = {};
  for (const req of requests) {
    const exactPath = exactById.get(req.tagPath);
    const exactLeaf = exactById.get(req.leaf);

    const icon =
      sanitizeIconId(exactPath?.icon ?? null, allowedPrefixes) ??
      bestIconByLowerId.get(req.tagPath.toLowerCase()) ??
      sanitizeIconId(exactLeaf?.icon ?? null, allowedPrefixes) ??
      bestIconByLowerId.get(req.leaf.toLowerCase()) ??
      null;

    out[req.tagPath] = icon;
  }

  return out;
}
