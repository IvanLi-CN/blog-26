import { eq } from "drizzle-orm";
import { db, initializeDB } from "@/lib/db";
import { isValidIconId } from "@/lib/icons/aliases";
import { tagCategories, tags as tagsTable } from "@/lib/schema";
import { pickBestIcon } from "@/server/ai/icon-reranker";
import { getPostsByTag } from "@/server/services/tag-service";

async function ensureDB() {
  if (!db) await initializeDB();
}

export async function suggestTagIcon(tagId: string) {
  // 提供上下文样本（最多3条）以提升 LLM 语义匹配质量
  let samples: Array<{ title: string; excerpt?: string | null }> = [];
  try {
    const posts = await getPostsByTag(tagId, { includeDrafts: true, includeUnpublished: true });
    samples = posts.slice(0, 3).map((p) => ({ title: p.title, excerpt: p.excerpt }));
  } catch {
    // ignore errors, fallback to no samples
  }
  const ai = await pickBestIcon({ type: "tag", name: tagId, samples });
  const candidates = ai.considered || [];
  return { candidates, ai };
}

export async function assignTagIcon(tagId: string, icon: string) {
  if (!isValidIconId(icon)) throw new Error("Invalid icon id");
  await ensureDB();
  if (!db) throw new Error("DB not initialized");
  const now = Math.floor(Date.now() / 1000);
  await db
    .insert(tagsTable)
    .values({
      id: tagId,
      icon,
      description: "",
      postCount: 0,
      memoCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({ target: tagsTable.id, set: { icon, updatedAt: now } });
}

export async function suggestCategoryIcon(key: string, title?: string) {
  const ai = await pickBestIcon({ type: "category", name: key, title });
  const candidates = ai.considered || [];
  return { candidates, ai };
}

export async function assignCategoryIcon(key: string, icon: string) {
  if (!isValidIconId(icon)) throw new Error("Invalid icon id");
  await ensureDB();
  if (!db) throw new Error("DB not initialized");
  const now = Math.floor(Date.now() / 1000);
  await db
    .insert(tagCategories)
    .values({ key, icon, title: key, description: "", createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: tagCategories.key, set: { icon, updatedAt: now } });
}

export async function getCategoryIcon(key: string): Promise<string | null> {
  await ensureDB();
  if (!db) throw new Error("DB not initialized");
  const rows = await db.select().from(tagCategories).where(eq(tagCategories.key, key));
  return rows[0]?.icon ?? null;
}

export async function getTagIcon(tagId: string): Promise<string | null> {
  await ensureDB();
  if (!db) throw new Error("DB not initialized");
  const rows = await db.select().from(tagsTable).where(eq(tagsTable.id, tagId));
  return rows[0]?.icon ?? null;
}

export async function getAllTagIcons(): Promise<Record<string, string | null>> {
  await ensureDB();
  if (!db) throw new Error("DB not initialized");
  const rows = await db.select({ id: tagsTable.id, icon: tagsTable.icon }).from(tagsTable);
  const out: Record<string, string | null> = {};
  for (const r of rows) out[r.id] = r.icon ?? null;
  return out;
}

export async function getAllCategoryIcons(): Promise<Record<string, string | null>> {
  await ensureDB();
  if (!db) throw new Error("DB not initialized");
  const rows = await db
    .select({ key: tagCategories.key, icon: tagCategories.icon })
    .from(tagCategories);
  const out: Record<string, string | null> = {};
  for (const r of rows) out[r.key] = r.icon ?? null;
  return out;
}
