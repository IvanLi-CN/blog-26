import { TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import { isValidIconId } from "@/lib/icons/aliases";
import { llmTierSchema } from "@/lib/llm-settings";
import { createContext } from "@/server/context";
import { appRouter } from "@/server/router";
import { getAdminLlmModelCatalog } from "@/server/services/llm-model-catalog";
import {
  getAdminLlmSettingsPayload,
  getResolvedLlmConfig,
  LlmSettingsInputError,
  testAdminLlmSettings,
  updateAdminLlmSettings,
} from "@/server/services/llm-settings";
import { organizeTagsWithAI } from "@/server/services/tag-ai";
import {
  readTagGroupsFromDB,
  validateTagGroupsConfig,
  writeTagGroupsToDB,
} from "@/server/services/tag-groups";
import {
  assignCategoryIcon,
  assignTagIcon,
  getAllCategoryIcons,
  getAllTagIcons,
  suggestCategoryIcon,
  suggestTagIcon,
} from "@/server/services/tag-icons";
import { getTagSummaries } from "@/server/services/tag-service";

function json(data: unknown, init: ResponseInit = {}, extraHeaders?: Headers) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  if (extraHeaders) {
    for (const [key, value] of extraHeaders.entries()) {
      headers.set(key, value);
    }
  }
  return new Response(JSON.stringify(data), { ...init, headers });
}

function statusFromTrpcError(error: TRPCError) {
  switch (error.code) {
    case "BAD_REQUEST":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "METHOD_NOT_SUPPORTED":
      return 405;
    case "CONFLICT":
      return 409;
    case "PRECONDITION_FAILED":
      return 412;
    case "NOT_IMPLEMENTED":
      return 501;
    case "SERVICE_UNAVAILABLE":
      return 503;
    default:
      return 500;
  }
}

function methodNotAllowed(method: string, resHeaders?: Headers) {
  return json(
    { error: { code: "METHOD_NOT_SUPPORTED", message: `Method ${method} not allowed` } },
    { status: 405 },
    resHeaders
  );
}

async function parseJsonBody<T = Record<string, unknown>>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return {} as T;
  }
  try {
    return (await request.json()) as T;
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid JSON body" });
  }
}

function getString(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getNumber(value: string | null, fallback: number): number {
  const raw = Number(value);
  return Number.isFinite(raw) ? raw : fallback;
}

async function createCallerForRequest(request: Request) {
  const resHeaders = new Headers();
  const ctx = await createContext({ req: request, resHeaders });
  return {
    caller: appRouter.createCaller(ctx),
    resHeaders,
    ctx,
  };
}

function withExtraHeaders(request: Request, extraHeaders: HeadersInit) {
  const headers = new Headers(request.headers);
  for (const [key, value] of new Headers(extraHeaders).entries()) {
    headers.set(key, value);
  }
  return new Request(request, { headers });
}

async function createAdminCallerForRequest(request: Request) {
  const state = await createCallerForRequest(request);
  if (!state.ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
  }
  if (!state.ctx.isAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Forbidden" });
  }
  return state;
}

function buildTagIconOverview(
  groupsCfg: Awaited<ReturnType<typeof readTagGroupsFromDB>>,
  summaries: Awaited<ReturnType<typeof getTagSummaries>>
) {
  const tagToGroup = new Map<string, { key: string; title: string }>();
  for (const group of groupsCfg.groups) {
    for (const tag of group.tags) {
      tagToGroup.set(tag, { key: group.key, title: group.title });
    }
  }

  const grouped = new Map<
    string,
    {
      key: string;
      title: string;
      tags: Array<{ name: string; lastSegment: string; count: number }>;
    }
  >();

  const ensure = (key: string, title: string) => {
    let record = grouped.get(key);
    if (!record) {
      record = { key, title, tags: [] };
      grouped.set(key, record);
    }
    return record;
  };

  for (const tag of summaries) {
    const group = tagToGroup.get(tag.name);
    const record = group ? ensure(group.key, group.title) : ensure("other", "Other");
    record.tags.push({
      name: tag.name,
      lastSegment: tag.lastSegment,
      count: tag.count,
    });
  }

  const ordered = groupsCfg.groups
    .map((group) => ({
      key: group.key,
      title: group.title,
      tags: grouped.get(group.key)?.tags ?? [],
    }))
    .filter((group) => group.tags.length > 0);

  if ((grouped.get("other")?.tags.length ?? 0) > 0) {
    ordered.push({ key: "other", title: "Other", tags: grouped.get("other")?.tags ?? [] });
  }

  return ordered;
}

export async function handleAdminApiRequest(request: Request, subPath: string) {
  try {
    const url = new URL(request.url);
    const pathname = subPath.replace(/\/+/g, "/").replace(/\/$/, "") || "/";

    if (pathname === "/session") {
      if (request.method !== "GET") return methodNotAllowed(request.method);
      const { ctx, resHeaders } = await createCallerForRequest(request);
      return json(
        {
          user: ctx.user ?? null,
          isAdmin: ctx.isAdmin,
        },
        { status: 200 },
        resHeaders
      );
    }

    const { caller, resHeaders } = await createAdminCallerForRequest(request);

    if (pathname === "/llm-settings") {
      if (request.method === "GET") {
        return json(await getAdminLlmSettingsPayload(), { status: 200 }, resHeaders);
      }
      if (request.method === "PUT") {
        const body = await parseJsonBody(request);
        try {
          return json(await updateAdminLlmSettings(body as never), { status: 200 }, resHeaders);
        } catch (error) {
          if (error instanceof ZodError || error instanceof LlmSettingsInputError) {
            return json(
              {
                error: {
                  code: "BAD_REQUEST",
                  message: error.message,
                },
              },
              { status: 400 },
              resHeaders
            );
          }
          throw error;
        }
      }
      return methodNotAllowed(request.method, resHeaders);
    }

    if (pathname === "/llm-settings/test") {
      if (request.method !== "POST") return methodNotAllowed(request.method, resHeaders);
      const body = await parseJsonBody(request);
      try {
        const payload = body as { tier?: unknown; settings?: unknown };
        const tier = llmTierSchema.parse(payload.tier);
        return json(
          await testAdminLlmSettings(tier, payload.settings as never),
          { status: 200 },
          resHeaders
        );
      } catch (error) {
        if (error instanceof ZodError || error instanceof LlmSettingsInputError) {
          return json(
            {
              error: {
                code: "BAD_REQUEST",
                message: error.message,
              },
            },
            { status: 400 },
            resHeaders
          );
        }
        throw error;
      }
    }

    if (pathname === "/llm-settings/catalog") {
      if (request.method !== "GET") return methodNotAllowed(request.method, resHeaders);
      const tierValue = getString(url.searchParams.get("tier"));
      try {
        const tier = tierValue ? llmTierSchema.parse(tierValue) : undefined;
        return json(
          await getAdminLlmModelCatalog({ tier, signal: request.signal }),
          { status: 200 },
          resHeaders
        );
      } catch (error) {
        if (error instanceof ZodError) {
          return json(
            {
              error: {
                code: "BAD_REQUEST",
                message: error.message,
              },
            },
            { status: 400 },
            resHeaders
          );
        }
        throw error;
      }
    }

    const previewPostMatch = pathname.match(/^\/preview\/posts\/(.+)$/);
    if (previewPostMatch) {
      if (request.method !== "GET") return methodNotAllowed(request.method, resHeaders);
      const slug = decodeURIComponent(previewPostMatch[1]);
      const previewRequest = withExtraHeaders(request, { "x-admin-preview": "1" });
      const previewState = await createCallerForRequest(previewRequest);
      const post = await previewState.caller.posts.get({ slug });
      return json(
        {
          kind: "post",
          ...post,
        },
        { status: 200 },
        previewState.resHeaders
      );
    }

    const previewMemoMatch = pathname.match(/^\/preview\/memos\/(.+)$/);
    if (previewMemoMatch) {
      if (request.method !== "GET") return methodNotAllowed(request.method, resHeaders);
      const slug = decodeURIComponent(previewMemoMatch[1]);
      const memo = await caller.memos.bySlug({ slug });
      return json(
        {
          kind: "memo",
          ...memo,
        },
        { status: 200 },
        resHeaders
      );
    }

    if (pathname === "/dashboard/stats") {
      if (request.method !== "GET") return methodNotAllowed(request.method, resHeaders);
      return json(await caller.admin.dashboard.stats(), { status: 200 }, resHeaders);
    }

    if (pathname === "/dashboard/recent-activity") {
      if (request.method !== "GET") return methodNotAllowed(request.method, resHeaders);
      return json(
        await caller.admin.dashboard.recentActivity({
          limit: getNumber(url.searchParams.get("limit"), 10),
        }),
        { status: 200 },
        resHeaders
      );
    }

    if (pathname === "/posts") {
      if (request.method === "GET") {
        const result = await caller.admin.posts.list({
          page: getNumber(url.searchParams.get("page"), 1),
          limit: getNumber(url.searchParams.get("limit"), 10),
          search: getString(url.searchParams.get("search")),
          status:
            (getString(url.searchParams.get("status")) as
              | "all"
              | "published"
              | "draft"
              | undefined) ?? "all",
          sortBy:
            (getString(url.searchParams.get("sortBy")) as
              | "publishDate"
              | "updateDate"
              | "title"
              | undefined) ?? "publishDate",
          sortOrder:
            (getString(url.searchParams.get("sortOrder")) as "asc" | "desc" | undefined) ?? "desc",
        });
        return json(result, { status: 200 }, resHeaders);
      }

      if (request.method === "POST") {
        const body = await parseJsonBody(request);
        return json(await caller.admin.posts.create(body as never), { status: 200 }, resHeaders);
      }

      return methodNotAllowed(request.method, resHeaders);
    }

    if (pathname === "/posts/batch") {
      if (request.method !== "POST") return methodNotAllowed(request.method, resHeaders);
      const body = await parseJsonBody(request);
      return json(await caller.admin.posts.batchUpdate(body as never), { status: 200 }, resHeaders);
    }

    if (pathname === "/posts/vectorize") {
      if (request.method !== "POST") return methodNotAllowed(request.method, resHeaders);
      const body = (await parseJsonBody(request)) as {
        slug?: string;
        isFull?: boolean;
        model?: string;
        chunking?: boolean;
      };

      if (body.slug) {
        return json(
          await caller.admin.vectorize.vectorizeBySlug({
            slug: body.slug,
            model: body.model,
            chunking: body.chunking,
          }),
          { status: 200 },
          resHeaders
        );
      }

      return json(
        await caller.admin.vectorize.triggerVectorize({
          isFull: body.isFull ?? false,
          model: body.model,
          chunking: body.chunking,
        }),
        { status: 200 },
        resHeaders
      );
    }

    const postBySlugMatch = pathname.match(/^\/posts\/by-slug\/(.+)$/);
    if (postBySlugMatch) {
      if (request.method !== "GET") return methodNotAllowed(request.method, resHeaders);
      const slug = decodeURIComponent(postBySlugMatch[1]);
      return json(await caller.admin.posts.getBySlug({ slug }), { status: 200 }, resHeaders);
    }

    const postMatch = pathname.match(/^\/posts\/([^/]+)$/);
    if (postMatch) {
      const id = decodeURIComponent(postMatch[1]);
      if (request.method === "GET") {
        return json(await caller.admin.posts.get({ id }), { status: 200 }, resHeaders);
      }
      if (request.method === "PATCH") {
        const body = await parseJsonBody(request);
        return json(
          await caller.admin.posts.update({ id, ...(body as object) } as never),
          { status: 200 },
          resHeaders
        );
      }
      if (request.method === "DELETE") {
        return json(await caller.admin.posts.delete({ id }), { status: 200 }, resHeaders);
      }
      return methodNotAllowed(request.method, resHeaders);
    }

    if (pathname === "/comments") {
      if (request.method !== "GET") return methodNotAllowed(request.method, resHeaders);
      return json(
        await caller.admin.comments.list({
          page: getNumber(url.searchParams.get("page"), 1),
          limit: getNumber(url.searchParams.get("limit"), 20),
          search: getString(url.searchParams.get("search")),
          status:
            (getString(url.searchParams.get("status")) as
              | "all"
              | "approved"
              | "pending"
              | "rejected"
              | undefined) ?? "all",
          sortBy:
            (getString(url.searchParams.get("sortBy")) as "createdAt" | "authorName" | undefined) ??
            "createdAt",
          sortOrder:
            (getString(url.searchParams.get("sortOrder")) as "asc" | "desc" | undefined) ?? "desc",
        }),
        { status: 200 },
        resHeaders
      );
    }

    if (pathname === "/comments/batch") {
      if (request.method !== "POST") return methodNotAllowed(request.method, resHeaders);
      const body = await parseJsonBody(request);
      return json(
        await caller.admin.comments.batchUpdate(body as never),
        { status: 200 },
        resHeaders
      );
    }

    const commentMatch = pathname.match(/^\/comments\/([^/]+)$/);
    if (commentMatch) {
      const id = decodeURIComponent(commentMatch[1]);
      if (request.method === "GET") {
        return json(await caller.admin.comments.get({ id }), { status: 200 }, resHeaders);
      }
      if (request.method === "PATCH") {
        const body = await parseJsonBody(request);
        return json(
          await caller.admin.comments.update({ id, ...(body as object) } as never),
          { status: 200 },
          resHeaders
        );
      }
      if (request.method === "DELETE") {
        return json(await caller.admin.comments.delete({ id }), { status: 200 }, resHeaders);
      }
      return methodNotAllowed(request.method, resHeaders);
    }

    if (pathname === "/content-sync/system-config") {
      if (request.method !== "GET") return methodNotAllowed(request.method, resHeaders);
      return json(await caller.admin.contentSync.getSystemConfig(), { status: 200 }, resHeaders);
    }

    if (pathname === "/content-sync/manager-stats") {
      if (request.method !== "GET") return methodNotAllowed(request.method, resHeaders);
      return json(await caller.admin.contentSync.getManagerStats(), { status: 200 }, resHeaders);
    }

    if (pathname === "/content-sync/content-stats") {
      if (request.method !== "GET") return methodNotAllowed(request.method, resHeaders);
      return json(await caller.admin.contentSync.getContentStats(), { status: 200 }, resHeaders);
    }

    if (pathname === "/content-sync/sources-status") {
      if (request.method !== "GET") return methodNotAllowed(request.method, resHeaders);
      return json(await caller.admin.contentSync.getSourcesStatus(), { status: 200 }, resHeaders);
    }

    if (pathname === "/content-sync/progress") {
      if (request.method !== "GET") return methodNotAllowed(request.method, resHeaders);
      return json(await caller.admin.contentSync.getSyncProgress(), { status: 200 }, resHeaders);
    }

    if (pathname === "/content-sync/logs") {
      if (request.method !== "GET") return methodNotAllowed(request.method, resHeaders);
      return json(
        await caller.admin.contentSync.getSyncLogs({
          limit: getNumber(url.searchParams.get("limit"), 100),
          offset: getNumber(url.searchParams.get("offset"), 0),
        }),
        { status: 200 },
        resHeaders
      );
    }

    if (pathname === "/content-sync/history") {
      if (request.method !== "GET") return methodNotAllowed(request.method, resHeaders);
      return json(
        await caller.admin.contentSync.getSyncHistory({
          limit: getNumber(url.searchParams.get("limit"), 20),
        }),
        { status: 200 },
        resHeaders
      );
    }

    if (pathname === "/content-sync/vectorization-stats") {
      if (request.method !== "GET") return methodNotAllowed(request.method, resHeaders);
      return json(
        await caller.admin.vectorize.getVectorizationStats(),
        { status: 200 },
        resHeaders
      );
    }

    if (pathname === "/content-sync/trigger") {
      if (request.method !== "POST") return methodNotAllowed(request.method, resHeaders);
      const body = await parseJsonBody(request);
      return json(
        await caller.admin.contentSync.triggerSync(body as never),
        { status: 200 },
        resHeaders
      );
    }

    if (pathname === "/content-sync/cancel") {
      if (request.method !== "POST") return methodNotAllowed(request.method, resHeaders);
      return json(await caller.admin.contentSync.cancelSync(), { status: 200 }, resHeaders);
    }

    if (pathname === "/content-sync/vectorize") {
      if (request.method !== "POST") return methodNotAllowed(request.method, resHeaders);
      const body = (await parseJsonBody(request)) as {
        isFull?: boolean;
        model?: string;
        chunking?: boolean;
      };
      return json(
        await caller.admin.vectorize.triggerVectorize({
          isFull: body.isFull ?? true,
          model: body.model,
          chunking: body.chunking,
        }),
        { status: 200 },
        resHeaders
      );
    }

    if (pathname === "/jobs") {
      if (request.method !== "GET") return methodNotAllowed(request.method, resHeaders);
      return json(await caller.admin.jobs.list(), { status: 200 }, resHeaders);
    }

    if (pathname === "/jobs/trigger") {
      if (request.method !== "POST") return methodNotAllowed(request.method, resHeaders);
      const body = await parseJsonBody(request);
      return json(await caller.admin.jobs.trigger(body as never), { status: 200 }, resHeaders);
    }

    if (pathname === "/jobs/runs") {
      if (request.method !== "GET") return methodNotAllowed(request.method, resHeaders);
      return json(
        await caller.admin.jobs.runs({
          key: getString(url.searchParams.get("key")),
          limit: getNumber(url.searchParams.get("limit"), 20),
        }),
        { status: 200 },
        resHeaders
      );
    }

    const runLogMatch = pathname.match(/^\/jobs\/runs\/([^/]+)\/log$/);
    if (runLogMatch) {
      if (request.method !== "GET") return methodNotAllowed(request.method, resHeaders);
      const id = decodeURIComponent(runLogMatch[1]);
      return json(await caller.admin.jobs.getRunLog({ id }), { status: 200 }, resHeaders);
    }

    const runMatch = pathname.match(/^\/jobs\/runs\/([^/]+)$/);
    if (runMatch) {
      if (request.method !== "GET") return methodNotAllowed(request.method, resHeaders);
      const id = decodeURIComponent(runMatch[1]);
      return json(await caller.admin.jobs.getRun({ id }), { status: 200 }, resHeaders);
    }

    if (pathname === "/pats") {
      if (request.method === "GET") {
        return json(
          await caller.admin.personalAccessTokens.list({
            includeRevoked: url.searchParams.get("includeRevoked") === "true",
          }),
          { status: 200 },
          resHeaders
        );
      }
      if (request.method === "POST") {
        const body = await parseJsonBody(request);
        return json(
          await caller.admin.personalAccessTokens.create(body as never),
          { status: 200 },
          resHeaders
        );
      }
      return methodNotAllowed(request.method, resHeaders);
    }

    const revokePatMatch = pathname.match(/^\/pats\/([^/]+)\/revoke$/);
    if (revokePatMatch) {
      if (request.method !== "POST") return methodNotAllowed(request.method, resHeaders);
      const tokenId = decodeURIComponent(revokePatMatch[1]);
      return json(
        await caller.admin.personalAccessTokens.revoke({ tokenId }),
        { status: 200 },
        resHeaders
      );
    }

    if (pathname === "/tags/overview") {
      if (request.method !== "GET") return methodNotAllowed(request.method, resHeaders);
      const [config, summaries, tagIcons, categoryIcons] = await Promise.all([
        readTagGroupsFromDB(),
        getTagSummaries({ includeDrafts: true, includeUnpublished: true }),
        getAllTagIcons(),
        getAllCategoryIcons(),
      ]);
      return json(
        {
          groups: config.groups,
          tagSummaries: summaries,
          tagIcons,
          categoryIcons,
          initialModel: (await getResolvedLlmConfig()).chat.model,
        },
        { status: 200 },
        resHeaders
      );
    }

    if (pathname === "/tags/organize") {
      if (request.method === "GET") {
        const current = await readTagGroupsFromDB();
        return json({ success: true, data: current }, { status: 200 }, resHeaders);
      }

      if (request.method === "POST") {
        const body = (await parseJsonBody(request)) as {
          targetGroups?: number;
          persist?: boolean;
          model?: string;
        };

        const result = await organizeTagsWithAI({
          targetGroups: body.targetGroups,
          model: body.model,
          signal: request.signal,
        });

        if (body.persist) {
          const tagSummaries = await getTagSummaries({
            includeDrafts: true,
            includeUnpublished: true,
          });
          const knownTags = tagSummaries.map((item) => item.name);
          const validation = validateTagGroupsConfig({ groups: result.groups }, { knownTags });
          if (!validation.valid) {
            return json(
              { success: false, error: "Validation failed", details: validation.errors },
              { status: 422 },
              resHeaders
            );
          }
          await writeTagGroupsToDB(result.groups, knownTags);
        }

        return json({ success: true, data: result }, { status: 200 }, resHeaders);
      }

      if (request.method === "PUT") {
        const body = (await parseJsonBody(request)) as { groups?: unknown };
        if (!Array.isArray(body.groups)) {
          return json({ success: false, error: "Invalid payload" }, { status: 400 }, resHeaders);
        }
        const tagSummaries = await getTagSummaries({
          includeDrafts: true,
          includeUnpublished: true,
        });
        const knownTags = tagSummaries.map((item) => item.name);
        const validation = validateTagGroupsConfig({ groups: body.groups as any }, { knownTags });
        if (!validation.valid) {
          return json(
            { success: false, error: "Validation failed", details: validation.errors },
            { status: 422 },
            resHeaders
          );
        }
        await writeTagGroupsToDB(body.groups as any, knownTags);
        return json({ success: true }, { status: 200 }, resHeaders);
      }

      return methodNotAllowed(request.method, resHeaders);
    }

    if (pathname === "/tag-icons/overview") {
      if (request.method !== "GET") return methodNotAllowed(request.method, resHeaders);
      const [groupsCfg, summaries, tagIcons, categoryIcons] = await Promise.all([
        readTagGroupsFromDB(),
        getTagSummaries({ includeDrafts: false, includeUnpublished: false }),
        getAllTagIcons(),
        getAllCategoryIcons(),
      ]);
      return json(
        {
          groups: buildTagIconOverview(groupsCfg, summaries),
          iconsMap: tagIcons,
          categoryIcons,
        },
        { status: 200 },
        resHeaders
      );
    }

    if (pathname === "/tag-icons/suggest") {
      if (request.method !== "POST") return methodNotAllowed(request.method, resHeaders);
      const body = (await parseJsonBody(request)) as {
        type?: "tag" | "category";
        name?: string;
        key?: string;
        title?: string;
      };
      if (body.type === "tag") {
        const name = String(body.name || "").trim();
        if (!name) return json({ error: "name required" }, { status: 400 }, resHeaders);
        const result = await suggestTagIcon(name);
        return json({ type: "tag", name, ...result }, { status: 200 }, resHeaders);
      }
      if (body.type === "category") {
        const key = String(body.key || "").trim();
        if (!key) return json({ error: "key required" }, { status: 400 }, resHeaders);
        const result = await suggestCategoryIcon(key, body.title ? String(body.title) : undefined);
        return json(
          { type: "category", key, title: body.title, ...result },
          { status: 200 },
          resHeaders
        );
      }
      return json({ error: "invalid type" }, { status: 400 }, resHeaders);
    }

    if (pathname === "/tag-icons/assign") {
      if (request.method !== "POST") return methodNotAllowed(request.method, resHeaders);
      const body = (await parseJsonBody(request)) as {
        type?: "tag" | "category";
        icon?: string;
        name?: string;
        key?: string;
      };
      const icon = typeof body.icon === "string" ? body.icon.trim() : "";
      const clearing = icon.length === 0;
      if (!clearing && !isValidIconId(icon)) {
        return json({ error: "invalid icon" }, { status: 400 }, resHeaders);
      }
      if (body.type === "tag") {
        const name = String(body.name || "").trim();
        if (!name) return json({ error: "name required" }, { status: 400 }, resHeaders);
        await assignTagIcon(name, clearing ? null : icon);
        return json({ ok: true }, { status: 200 }, resHeaders);
      }
      if (body.type === "category") {
        const key = String(body.key || "").trim();
        if (!key) return json({ error: "key required" }, { status: 400 }, resHeaders);
        await assignCategoryIcon(key, clearing ? null : icon);
        return json({ ok: true }, { status: 200 }, resHeaders);
      }
      return json({ error: "invalid type" }, { status: 400 }, resHeaders);
    }

    if (pathname === "/files/sources") {
      if (request.method !== "GET") return methodNotAllowed(request.method, resHeaders);
      return json(await caller.admin.files.getSources(), { status: 200 }, resHeaders);
    }

    if (pathname === "/files/tree") {
      if (request.method !== "GET") return methodNotAllowed(request.method, resHeaders);
      return json(
        await caller.admin.files.listDirectory({
          source: getString(url.searchParams.get("source")) || "local",
          path: url.searchParams.get("path") || "",
        }),
        { status: 200 },
        resHeaders
      );
    }

    if (pathname === "/files/read") {
      if (request.method !== "GET") return methodNotAllowed(request.method, resHeaders);
      return json(
        await caller.admin.files.readFile({
          source: getString(url.searchParams.get("source")) || "local",
          path: getString(url.searchParams.get("path")) || "",
        }),
        { status: 200 },
        resHeaders
      );
    }

    if (pathname === "/files/write") {
      if (request.method !== "POST") return methodNotAllowed(request.method, resHeaders);
      const body = await parseJsonBody(request);
      return json(await caller.admin.files.writeFile(body as never), { status: 200 }, resHeaders);
    }

    if (pathname === "/files/rename") {
      if (request.method !== "POST") return methodNotAllowed(request.method, resHeaders);
      const body = await parseJsonBody(request);
      return json(await caller.admin.files.renameFile(body as never), { status: 200 }, resHeaders);
    }

    if (pathname === "/files/create-directory") {
      if (request.method !== "POST") return methodNotAllowed(request.method, resHeaders);
      const body = await parseJsonBody(request);
      return json(
        await caller.admin.files.createDirectory(body as never),
        { status: 200 },
        resHeaders
      );
    }

    return json(
      { error: { code: "NOT_FOUND", message: "Not found" } },
      { status: 404 },
      resHeaders
    );
  } catch (error) {
    if (error instanceof TRPCError) {
      return json(
        { error: { code: error.code, message: error.message } },
        { status: statusFromTrpcError(error) }
      );
    }

    console.error("[admin-api] unexpected error", error);
    return json(
      { error: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
