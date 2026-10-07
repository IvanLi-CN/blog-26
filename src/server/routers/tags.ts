import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { ClippingReading } from "@/lib/memo-clipping";
import type { PublicMediaCollection } from "@/lib/public-media";
import { getTaggedProjects } from "@/lib/snapshot-tags";
import { matchesTag, normalizeTagPath } from "@/lib/tag-directory";
import { readEligibleContent } from "@/server/services/tag-content";
import { resolveTagIconsForTags } from "@/server/services/tag-icon-resolver";
import { createTRPCRouter, publicProcedure } from "../trpc";

const timelineSchema = z.object({
  tagPath: z.string().min(1),
  limit: z.number().min(1).max(50).default(20),
  cursor: z.string().optional(), // cursor format: "publishDateISO_id"
});

function decodeMaybeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export type TagsTimelineItem = {
  type: "post" | "memo";
  id: string;
  slug: string;
  title: string;
  excerpt?: string;
  content?: string;
  clipping?: ClippingReading;
  publishDate: string;
  tags: string[];
  image?: string;
  media?: PublicMediaCollection;
  dataSource?: string;
  filePath?: string;
};

export const tagsRouter = createTRPCRouter({
  timeline: publicProcedure.input(timelineSchema).query(async ({ input, ctx }) => {
    const limit = input.limit;
    const tagPath = normalizeTagPath(decodeMaybeURIComponent(input.tagPath));
    const cursor = input.cursor ? decodeMaybeURIComponent(input.cursor) : undefined;

    if (!tagPath) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "tagPath is required" });
    }

    try {
      const content = await readEligibleContent({
        includeDrafts: ctx.isAdmin,
        includeUnpublished: ctx.isAdmin,
      });
      let items: TagsTimelineItem[] = [
        ...content.posts.map((post) => ({
          type: "post" as const,
          id: post.id,
          slug: post.slug,
          title: post.title,
          excerpt: post.excerpt ?? undefined,
          publishDate: post.publishDate,
          tags: post.tags,
          image: post.image ?? undefined,
          media: post.media,
          dataSource: post.dataSource ?? undefined,
          filePath: post.filePath,
        })),
        ...content.memos.map((memo) => ({
          type: "memo" as const,
          id: memo.id,
          slug: memo.slug,
          title: memo.title ?? "",
          excerpt: memo.excerpt ?? undefined,
          content: memo.content,
          ...(memo.clipping ? { clipping: memo.clipping } : {}),
          publishDate: memo.publishedAt ?? memo.createdAt,
          tags: memo.tags,
          image: memo.image ?? undefined,
          media: memo.media,
          dataSource: memo.dataSource ?? undefined,
          filePath: memo.filePath,
        })),
      ]
        .filter((item) => matchesTag(tagPath, item.tags))
        .sort(
          (a, b) =>
            b.publishDate.localeCompare(a.publishDate) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
        );
      if (cursor) {
        const separator = cursor.indexOf("_");
        const date = cursor.slice(0, separator);
        const id = cursor.slice(separator + 1);
        const timestamp = Date.parse(date);
        if (separator > 0 && id && Number.isFinite(timestamp)) {
          items = items.filter(
            (item) =>
              Date.parse(item.publishDate) < timestamp ||
              (Date.parse(item.publishDate) === timestamp && item.id < id)
          );
        }
      }
      const hasMore = items.length > limit;
      const page = items.slice(0, limit);
      const last = page.at(-1);
      return {
        projects: getTaggedProjects(tagPath),
        items: page,
        hasMore,
        nextCursor: hasMore && last ? `${last.publishDate}_${last.id}` : undefined,
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
