import { and, desc, eq, inArray } from "drizzle-orm";
import OpenAI from "openai";
import { enhanced } from "@/lib/ai/search";
import {
  buildFallbackSearchSuggestionItems,
  normalizeSearchSuggestionItems,
  type SearchSuggestionItem,
  type SearchSuggestionReason,
  type SearchSuggestionSeed,
  searchSuggestionItemRelatesToQuery,
} from "@/lib/ai/search-suggestions";
import { db, initializeDB } from "@/lib/db";
import { posts } from "@/lib/schema";
import { getResolvedLlmConfig } from "@/server/services/llm-settings";

export type PublicSearchSuggestionsResult = {
  suggestions: string[];
  items: SearchSuggestionItem[];
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
  items: SearchSuggestionItem[]
): PublicSearchSuggestionsResult {
  return {
    suggestions: items.map((item) => item.term),
    items,
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

function seedLexicallyMatches(term: string, seeds: SearchSuggestionSeed[]) {
  const normalizedTerm = term.trim().toLowerCase();
  if (!normalizedTerm) return false;
  return seeds.some((seed) => {
    const text = [seed.title, seed.excerpt, ...(seed.tags ?? [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return text.includes(normalizedTerm);
  });
}

async function validateSuggestionItems(
  items: SearchSuggestionItem[],
  seeds: SearchSuggestionSeed[],
  limit: number,
  query: string
): Promise<SearchSuggestionItem[]> {
  if (items.length === 0) return [];

  const validated = await Promise.all(
    items.map(async (item) => {
      if (!searchSuggestionItemRelatesToQuery(item, query)) return null;
      try {
        const results = await enhanced({
          q: item.term,
          topK: 5,
          publishedOnly: true,
          rerank: false,
        });
        if (results.length === 0 && !seedLexicallyMatches(item.term, seeds)) return null;
        const slugSignature = results
          .slice(0, 3)
          .map((result) => result.slug)
          .join("|");
        return {
          ...item,
          resultCount: results.length,
          score:
            (item.score ?? 0) +
            results.length * 4 +
            (slugSignature ? Math.min(slugSignature.length, 40) / 10 : 0),
        };
      } catch {
        return seedLexicallyMatches(item.term, seeds) ? { ...item, resultCount: 1 } : null;
      }
    })
  );

  const best = new Map<string, SearchSuggestionItem>();
  for (const item of validated) {
    if (!item) continue;
    const key = item.term.toLowerCase();
    const current = best.get(key);
    if (!current || (item.score ?? 0) > (current.score ?? 0)) {
      best.set(key, item);
    }
  }

  return Array.from(best.values())
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);
}

export async function suggestPublicSearchTerms(
  input: SuggestPublicSearchTermsInput
): Promise<PublicSearchSuggestionsResult> {
  const query = input.query.trim();
  if (!query) return { suggestions: [], items: [], source: "fallback", reason: input.reason };

  const seeds = await loadPublicSuggestionSeeds();
  const fallbackItems = await validateSuggestionItems(
    buildFallbackSearchSuggestionItems(query, seeds, input.limit ?? 5),
    seeds,
    input.limit ?? 5,
    query
  );
  const fallback = buildFallbackResult({ ...input, query }, fallbackItems);
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
            "You are designing recovery search terms for a public technical blog.",
            "Do not merely replace synonyms. First infer what concept/domain the failed query may mean.",
            "Then propose concept directions in exactly these strategy values:",
            "broader_by_domain, related, sibling, alternative_label.",
            "Meanings: broader_by_domain = same thing generalized in another/larger domain; related = adjacent concept likely discussed together; sibling = peer concept in the same family; alternative_label = another name for the same concept.",
            "Avoid task/action keywords such as install, config, debug, tutorial, setup unless they are explicit concepts in the catalog.",
            "Every suggestion must be likely to match the provided public content catalog.",
            'Respond with ONLY JSON: {"interpretations":[{"concept":"...","domain":"...","confidence":0.0}],"suggestions":[{"term":"...","strategy":"broader_by_domain","concept":"...","domain":"...","rationale":"..."}]}',
            "Rules: 3-5 suggestions, concise terms, no sentences as terms, no URLs, no markdown, no exact copy of the failed query.",
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
    const suggestedItems = normalizeSearchSuggestionItems(
      parsed.suggestions,
      query,
      input.limit ?? 5
    );
    const validatedItems = await validateSuggestionItems(
      suggestedItems,
      seeds,
      input.limit ?? 5,
      query
    );
    if (validatedItems.length === 0) return fallback;
    return {
      suggestions: validatedItems.map((item) => item.term),
      items: validatedItems,
      source: "llm",
      reason: input.reason,
    };
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
