import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { posts } from "@/lib/schema";
import { toMsTimestamp } from "@/lib/utils";
import { resolveTagIconsForTags } from "@/server/services/tag-icon-resolver";
import { createTRPCRouter, publicProcedure } from "../trpc";

const timelineSchema = z.object({
  tagPath: z.string().min(1),
  limit: z.number().min(1).max(50).default(20),
  cursor: z.string().optional(), // cursor format: "publishDateISO_id"
});

function normalizeTags(raw: unknown): string[] {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw.map((tag) => String(tag).trim()).filter((tag) => tag.length > 0);
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((tag) => String(tag).trim()).filter((tag) => tag.length > 0);
      }
    } catch {
      // ignore JSON parse errors and fall back to comma-separated parsing
    }

    return trimmed
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  return [];
}

function decodeMaybeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function buildHierarchicalTagFilter(tagPath: string) {
  // Tags are stored as a JSON string array, e.g. ["Geek/SMS","Geek/SMS/Child"].
  // We match:
  // - exact element: "Geek/SMS"
  // - hierarchical child: "Geek/SMS/<...>"
  const exact = like(posts.tags, `%"${tagPath}"%`);
  const childPrefix = like(posts.tags, `%"${tagPath}/%`);
  return or(exact, childPrefix);
}

export type TagsTimelineItem = {
  type: "post" | "memo";
  id: string;
  slug: string;
  title: string;
  excerpt?: string;
  content?: string;
  publishDate: string;
  tags: string[];
  image?: string;
  dataSource?: string;
};

export const tagsRouter = createTRPCRouter({
  timeline: publicProcedure.input(timelineSchema).query(async ({ input, ctx }) => {
    const limit = input.limit;
    const tagPath = decodeMaybeURIComponent(input.tagPath.trim());
    const cursor = input.cursor ? decodeMaybeURIComponent(input.cursor) : undefined;

    if (!tagPath) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "tagPath is required" });
    }

    try {
      const conditions = [
        inArray(posts.type, ["post", "memo"]),
        buildHierarchicalTagFilter(tagPath),
      ];

      if (!ctx.isAdmin) {
        conditions.push(eq(posts.public, true));
        conditions.push(sql`(${posts.type} <> 'post' OR ${posts.draft} = 0)`);
      }

      // Cursor pagination (publishDate DESC, id DESC) using (publishDate, id)
      if (cursor) {
        try {
          const [cursorDate, cursorId] = cursor.split("_");
          if (cursorDate && cursorId) {
            const cursorTimestamp = new Date(cursorDate).getTime();
            if (!Number.isNaN(cursorTimestamp)) {
              conditions.push(
                sql`(${posts.publishDate} < ${cursorTimestamp} OR (${posts.publishDate} = ${cursorTimestamp} AND ${posts.id} < ${cursorId}))`
              );
            }
          }
        } catch (error) {
          console.error("[tags.timeline] Failed to parse cursor:", error);
        }
      }

      const rows = await db
        .select({
          id: posts.id,
          slug: posts.slug,
          type: posts.type,
          title: posts.title,
          excerpt: posts.excerpt,
          body: posts.body,
          publishDate: posts.publishDate,
          tags: posts.tags,
          image: posts.image,
          dataSource: posts.dataSource,
        })
        .from(posts)
        .where(and(...conditions))
        .orderBy(desc(posts.publishDate), desc(posts.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const actual = hasMore ? rows.slice(0, limit) : rows;

      const items: TagsTimelineItem[] = actual.map((row) => ({
        type: row.type === "memo" ? "memo" : "post",
        id: row.id,
        slug: row.slug,
        title: row.title,
        excerpt: row.excerpt ?? undefined,
        content: row.type === "memo" ? row.body : undefined,
        publishDate: new Date(toMsTimestamp(row.publishDate)).toISOString(),
        tags: normalizeTags(row.tags),
        image: row.image ?? undefined,
        dataSource: row.dataSource ?? undefined,
      }));

      let nextCursor: string | undefined;
      if (hasMore && actual.length > 0) {
        const last = actual[actual.length - 1];
        const lastDateIso = new Date(toMsTimestamp(last.publishDate)).toISOString();
        nextCursor = `${lastDateIso}_${last.id}`;
      }

      return {
        items,
        nextCursor,
        hasMore,
      };
    } catch (error) {
      console.error("[tags.timeline] Failed:", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to load timeline" });
    }
  }),

  icons: publicProcedure
    .input(
      z.object({
        tags: z.array(z.string()).max(200),
      })
    )
    .query(async ({ input }) => {
      const deduped = Array.from(new Set(input.tags));
      const icons = await resolveTagIconsForTags(deduped);
      return { icons };
    }),
});
