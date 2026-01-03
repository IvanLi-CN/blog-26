"use client";

import { trpcVanilla } from "@/lib/trpc";
import { normalizeTagPath } from "./normalize-tag-path";

export type TagIconMap = Record<string, string | null>;

const iconCache = new Map<string, string | null>();
const pendingByTagPath = new Map<
  string,
  { promise: Promise<string | null>; resolve: (value: string | null) => void }
>();
const queuedTagPaths = new Set<string>();

const MAX_TAGS_PER_BATCH = 200;

let flushScheduled = false;
let flushInProgress = false;

function scheduleFlush(): void {
  if (flushInProgress) return;
  if (flushScheduled) return;
  flushScheduled = true;

  queueMicrotask(() => {
    flushScheduled = false;
    void flushQueue();
  });
}

async function flushQueue(): Promise<void> {
  if (flushInProgress) return;
  flushInProgress = true;

  try {
    while (queuedTagPaths.size > 0) {
      const tagPaths = Array.from(queuedTagPaths);
      queuedTagPaths.clear();

      for (let offset = 0; offset < tagPaths.length; offset += MAX_TAGS_PER_BATCH) {
        const chunk = tagPaths.slice(offset, offset + MAX_TAGS_PER_BATCH);

        let icons: TagIconMap = {};
        try {
          const result = await trpcVanilla.tags.icons.query({ tags: chunk });
          icons = result.icons ?? {};
        } catch {
          icons = {};
        }

        for (const tagPath of chunk) {
          const icon = icons[tagPath] ?? null;
          iconCache.set(tagPath, icon);

          const pending = pendingByTagPath.get(tagPath);
          pendingByTagPath.delete(tagPath);
          pending?.resolve(icon);
        }
      }
    }
  } finally {
    flushInProgress = false;

    if (queuedTagPaths.size > 0) {
      scheduleFlush();
    }
  }
}

export function seedTagIconCache(iconMap: TagIconMap | undefined): void {
  if (!iconMap) return;

  for (const [rawTagPath, icon] of Object.entries(iconMap)) {
    const normalizedTagPath = normalizeTagPath(rawTagPath);
    if (!normalizedTagPath) continue;

    iconCache.set(normalizedTagPath, icon);

    const pending = pendingByTagPath.get(normalizedTagPath);
    if (pending) {
      pendingByTagPath.delete(normalizedTagPath);
      queuedTagPaths.delete(normalizedTagPath);
      pending.resolve(icon);
    }
  }
}

function ensureTagIcon(normalizedTagPath: string): Promise<string | null> {
  const tagPath = normalizeTagPath(normalizedTagPath);
  if (!tagPath) return Promise.resolve(null);

  const cached = iconCache.get(tagPath);
  if (cached !== undefined) return Promise.resolve(cached);

  const existing = pendingByTagPath.get(tagPath);
  if (existing) return existing.promise;

  let resolve!: (value: string | null) => void;
  const promise = new Promise<string | null>((res) => {
    resolve = res;
  });

  pendingByTagPath.set(tagPath, { promise, resolve });
  queuedTagPaths.add(tagPath);
  scheduleFlush();

  return promise;
}

export async function getTagIcons(tagPaths: string[], iconMap?: TagIconMap): Promise<TagIconMap> {
  seedTagIconCache(iconMap);

  const normalized = tagPaths
    .map((tagPath) => normalizeTagPath(tagPath))
    .filter((tagPath) => tagPath.length > 0);

  const unique = Array.from(new Set(normalized));
  await Promise.all(unique.map((tagPath) => ensureTagIcon(tagPath)));

  const out: TagIconMap = {};
  for (const tagPath of unique) {
    out[tagPath] = iconCache.get(tagPath) ?? null;
  }

  return out;
}
