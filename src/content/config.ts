import { defineCollection, type SchemaContext, z } from 'astro:content';

const metadataDefinition = () =>
  z
    .object({
      title: z.string().optional(),
      ignoreTitleTemplate: z.boolean().optional(),

      canonical: z.string().url().optional(),

      robots: z
        .object({
          index: z.boolean().optional(),
          follow: z.boolean().optional(),
        })
        .optional(),

      description: z.string().optional(),

      keywords: z.string().optional(),

      openGraph: z
        .object({
          url: z.string().optional(),
          siteName: z.string().optional(),
          images: z
            .array(
              z.object({
                url: z.string(),
                width: z.number().optional(),
                height: z.number().optional(),
              })
            )
            .optional(),
          locale: z.string().optional(),
          type: z.string().optional(),
        })
        .optional(),

      twitter: z
        .object({
          handle: z.string().optional(),
          site: z.string().optional(),
          cardType: z.string().optional(),
        })
        .optional(),
    })
    .optional();

const postSchema = ({ image }: SchemaContext) => {
  return z.object({
    publishDate: z.date().optional(),
    updateDate: z.date().optional(),
    date: z
      .union([
        z
          .string()
          .refine(
            (val) => {
              const date = new Date(val);
              return !isNaN(date.getTime());
            },
            {
              message: 'Invalid date format',
            }
          )
          .transform((val) => new Date(val)),
        z.date(),
      ])
      .optional(),
    draft: z.boolean().default(true),
    public: z.boolean().default(true),

    title: z.string(),
    excerpt: z.string().optional(),
    summary: z.string().optional(),
    image: z
      .union([
        z.preprocess((val) => (typeof val === 'string' ? decodeURIComponent(val) : val), image()),
        z.string().regex(/^(https?:)?\/\//),
      ])
      .optional(),
    images: z
      .array(
        z.union([
          z.preprocess((val) => (typeof val === 'string' ? decodeURIComponent(val) : val), image()),
          z.string().regex(/^(https?:)?\/\//),
        ])
      )
      .optional(),

    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    author: z.string().optional(),

    metadata: metadataDefinition(),
  });
};

const postCollection = defineCollection({
  schema: postSchema,
});

export const collections = {
  post: postCollection,
  // 保留 notes 和 local-notes 集合定义以支持类型系统，但目录可能不存在
  notes: defineCollection({
    schema: (ctx) =>
      postSchema(ctx).extend({
        title: z.string().optional(),
      }),
  }),
  ['local-notes']: defineCollection({
    schema: (ctx) =>
      postSchema(ctx).extend({
        title: z.string().optional(),
      }),
  }),
};
