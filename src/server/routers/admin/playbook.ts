import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getRuntimePlaybookStore } from "../../../lib/playbook/cache";
import { searchPlaybookAdmin } from "../../../lib/playbook/supplement";
import { adminProcedure, createTRPCRouter } from "../../trpc";

const browseSchema = z.object({
  query: z.string().trim().max(200).optional(),
  kind: z.enum(["all", "project", "topic", "search"]).default("all"),
  slug: z.string().trim().min(1).max(200).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const adminPlaybookRouter = createTRPCRouter({
  browse: adminProcedure.input(browseSchema).query(async ({ input }) => {
    const store = getRuntimePlaybookStore();
    await store.load();
    const edition = store.adminEdition;
    if (!edition) {
      throw new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message: "Playbook data is not available",
      });
    }

    const project = input.slug
      ? edition.catalog.project_details.find((detail) => detail.item.slug === input.slug)
      : undefined;
    const topic = input.slug
      ? edition.catalog.topic_details.find((detail) => detail.item.slug === input.slug)
      : undefined;
    if (input.slug && input.kind === "project" && !project)
      throw new TRPCError({ code: "NOT_FOUND", message: "Playbook project not found" });
    if (input.slug && input.kind === "topic" && !topic)
      throw new TRPCError({ code: "NOT_FOUND", message: "Playbook topic not found" });

    return {
      source: edition.edition.source,
      edition: edition.edition.editionDigest,
      supplementAvailable: Boolean(edition.supplement),
      catalog: {
        index: edition.catalog.snapshot.index,
        projects:
          input.kind === "topic" ? [] : edition.catalog.snapshot.projects.slice(0, input.limit),
        topics:
          input.kind === "project" ? [] : edition.catalog.snapshot.topics.slice(0, input.limit),
        private_source_metadata: edition.catalog.private_source_metadata,
        relation_edges: edition.catalog.relation_edges,
      },
      project: input.kind === "topic" ? undefined : project,
      topic: input.kind === "project" ? undefined : topic,
      results:
        input.kind === "search" || input.query
          ? searchPlaybookAdmin(edition, input.query || "", input.limit)
          : [],
    };
  }),
});
