import { and, desc, eq, inArray } from "drizzle-orm";
import OpenAI from "openai";
import {
  buildFallbackSearchSuggestions,
  normalizeSearchSuggestions,
  type SearchSuggestionReason,
  type SearchSuggestionSeed,
} from "@/lib/ai/search-suggestions";
import { db, initializeDB } from "@/lib/db";
import { posts } from "@/lib/schema";
import { getResolvedLlmConfig } from "@/server/services/llm-settings";

export type PublicSearchSuggestionsResult = {
  suggestions: string[];
  source: "llm" | "fallback";
  reason: SearchSuggestionReason;
};

type SuggestPublicSearchTermsInput = {
  query: string;
  reason: SearchSuggestionReason;
  limit?: number;
};

function parseTags(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim() !== "");
  } catch {
    return [];
  }
}

async function ensureDBReady() {
  if (!db) await initializeDB();
  if (!db) throw new Error("DB not initialized");
}

async function loadPublicSuggestionSeeds(limit = 80): Promise<SearchSuggestionSeed[]> {
  await ensureDBReady();
  const rows = await db
    .select({
      title: posts.title,
      excerpt: posts.excerpt,
      tags: posts.tags,
    })
    .from(posts)
    .where(
      and(eq(posts.public, true), eq(posts.draft, false), inArray(posts.type, ["post", "memo"]))
    )
    .orderBy(desc(posts.publishDate))
    .limit(limit);

  return rows.map((row) => ({
    title: row.title,
    excerpt: row.excerpt,
    tags: parseTags(row.tags),
  }));
}

function buildFallbackResult(
  input: SuggestPublicSearchTermsInput,
  seeds: SearchSuggestionSeed[]
): PublicSearchSuggestionsResult {
  return {
    suggestions: buildFallbackSearchSuggestions(input.query, seeds, input.limit ?? 5),
    source: "fallback",
    reason: input.reason,
  };
}

function parseJsonObject(content: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    const first = content.indexOf("{");
    const last = content.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) return {};
    try {
      const parsed = JSON.parse(content.slice(first, last + 1));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
}

function compactSeed(seed: SearchSuggestionSeed) {
  const title = (seed.title ?? "").slice(0, 72);
  const excerpt = (seed.excerpt ?? "").replace(/\s+/g, " ").slice(0, 120);
  const tags = (seed.tags ?? []).slice(0, 5).join(", ");
  return `- ${title}${excerpt ? ` | ${excerpt}` : ""}${tags ? ` | tags: ${tags}` : ""}`;
}

export async function suggestPublicSearchTerms(
  input: SuggestPublicSearchTermsInput
): Promise<PublicSearchSuggestionsResult> {
  const query = input.query.trim();
  if (!query) return { suggestions: [], source: "fallback", reason: input.reason };

  const seeds = await loadPublicSuggestionSeeds();
  const fallback = buildFallbackResult({ ...input, query }, seeds);
  const resolved = await getResolvedLlmConfig();
  const apiKey = resolved.chat.apiKey || "";
  if (!apiKey) return fallback;

  const model = resolved.chat.model || "gpt-4o-mini";
  const baseURL = (resolved.chat.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const openai = new OpenAI({ apiKey, baseURL });
  const catalog = seeds.slice(0, 42).map(compactSeed).join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: [
            "You are a search assistant for a public technical blog.",
            "Return concise search keywords that are likely to match the provided public content catalog.",
            'Respond with ONLY JSON: {"suggestions":["term",...]}',
            "Rules: 3-5 terms, no sentences, no URLs, no markdown, no exact copy of the failed query.",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            failedQuery: query,
            reason: input.reason,
            publicCatalog: catalog,
          }),
        },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content || "";
    const parsed = parseJsonObject(content);
    const suggestions = normalizeSearchSuggestions(parsed.suggestions, query, input.limit ?? 5);
    if (suggestions.length === 0) return fallback;
    return { suggestions, source: "llm", reason: input.reason };
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code?: unknown }).code
        : "unknown";
    const status =
      error && typeof error === "object" && "status" in error
        ? (error as { status?: unknown }).status
        : "unknown";
    // eslint-disable-next-line no-console
    console.warn("[search-suggestions] LLM suggestions unavailable", { code, status });
    return fallback;
  }
}
