import { defineCollection, z } from 'astro:content';

// This schema is now primarily for reference and potential future use with Astro's tooling.
// The runtime parsing is handled manually in `src/lib/content.ts`.
const postSchema = z.object({
  title: z.string(),
  slug: z.string().optional(),
  publishDate: z.any().optional(),
  updateDate: z.any().optional(),
  date: z.any().optional(), // Alias for updateDate
  draft: z.boolean().optional(),
  public: z.boolean().default(false),
  excerpt: z.string().optional(),
  summary: z.string().optional(), // Alias for excerpt
  image: z.any().optional(),
  images: z.array(z.any()).optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  author: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const notesSchema = postSchema.extend({
  title: z.string().optional(),
});

export const collections = {
  posts: defineCollection({ schema: postSchema }),
  projects: defineCollection({ schema: postSchema }),
  notes: defineCollection({ schema: notesSchema }),
  'local-notes': defineCollection({ schema: notesSchema }),
};
