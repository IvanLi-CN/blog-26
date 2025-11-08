import { inArray, sql } from "drizzle-orm";
import { db, initializeDB } from "@/lib/db";
import { tags as tagsTable } from "@/lib/schema";
import type { TagGroup, TagGroupsConfig } from "@/types/tag-groups";

export async function ensureDB() {
  if (!db) await initializeDB();
}

// Validation logic preserved from file-based config service
export function validateTagGroupsConfig(
  config: TagGroupsConfig,
  options?: { knownTags?: string[] }
): { valid: true } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  const seenKeys = new Set<string>();
  const seenTags = new Set<string>();
  const knownTagsSet = options?.knownTags ? new Set(options.knownTags) : undefined;

  config.groups.forEach((group, idx) => {
    if (!group.key || typeof group.key !== "string") {
      errors.push(`Group at index ${idx} missing key`);
    } else if (seenKeys.has(group.key)) {
      errors.push(`Duplicate group key: ${group.key}`);
    } else {
      seenKeys.add(group.key);
    }

    if (!group.title || typeof group.title !== "string") {
      errors.push(`Group ${group.key || idx} missing title`);
    } else {
      const normalized = group.title.trim();
      if (/(?:^|\s)and(?:\s|$)/i.test(normalized) || normalized.includes("&")) {
        errors.push(
          `Group ${group.key || idx} title contains disallowed conjunction: ${group.title}`
        );
      }
    }

    group.tags.forEach((tag) => {
      if (seenTags.has(tag)) {
        errors.push(`Tag ${tag} assigned multiple times`);
      } else {
        seenTags.add(tag);
      }
      if (knownTagsSet && !knownTagsSet.has(tag)) {
        errors.push(`Tag ${tag} not present in source list`);
      }
    });
  });

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true };
}

// Read groups from DB for provided tag names (or all with non-null category)
export async function readTagGroupsFromDB(tagNames?: string[]): Promise<TagGroupsConfig> {
  await ensureDB();
  if (!db) throw new Error("DB not initialized");

  const where = tagNames && tagNames.length > 0 ? inArray(tagsTable.id, tagNames) : sql`1=1`;

  const rows = await db
    .select({
      id: tagsTable.id,
      categoryKey: tagsTable.categoryKey,
      categoryTitle: tagsTable.categoryTitle,
      icon: tagsTable.icon,
    })
    .from(tagsTable)
    .where(where);

  // group by categoryKey
  const groupsMap = new Map<string, TagGroup>();
  for (const row of rows) {
    if (!row.categoryKey) continue; // skip unassigned
    const key = row.categoryKey;
    const title = row.categoryTitle || key;
    const g = groupsMap.get(key) || { key, title, tags: [] };
    g.tags.push(row.id);
    groupsMap.set(key, g);
  }

  // Sort groups by title to keep it stable
  const groups = Array.from(groupsMap.values()).sort((a, b) => a.title.localeCompare(b.title));
  return { groups };
}

// Apply groups into DB: upsert every tag with its category; unmentioned known tags get category cleared
export async function writeTagGroupsToDB(groups: TagGroup[], knownTags?: string[]): Promise<void> {
  await ensureDB();
  if (!db) throw new Error("DB not initialized");

  const now = Math.floor(Date.now() / 1000);
  const byTag = new Map<string, { key: string; title: string }>();
  for (const group of groups) {
    for (const tag of group.tags) {
      byTag.set(tag, { key: group.key, title: group.title });
    }
  }

  const targetTagList = knownTags && knownTags.length > 0 ? knownTags : Array.from(byTag.keys());

  // Upsert all known tags to ensure row existence
  for (const tag of targetTagList) {
    const meta = byTag.get(tag);
    if (meta) {
      // upsert: update if exists, else insert
      await db
        .insert(tagsTable)
        .values({
          id: tag,
          categoryKey: meta.key,
          categoryTitle: meta.title,
          description: "",
          postCount: 0,
          memoCount: 0,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: tagsTable.id,
          set: {
            categoryKey: meta.key,
            categoryTitle: meta.title,
            updatedAt: now,
          },
        });
    } else {
      // clear category for tags not included
      await db
        .insert(tagsTable)
        .values({
          id: tag,
          description: "",
          postCount: 0,
          memoCount: 0,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: tagsTable.id,
          set: { categoryKey: null, categoryTitle: null, updatedAt: now },
        });
    }
  }
}

export async function getCurrentGroupCount(): Promise<number> {
  const cfg = await readTagGroupsFromDB();
  return cfg.groups.length || 0;
}
