import OpenAI from "openai";
import type { TagGroup } from "@/types/tag-groups";
import { getCurrentGroupCount, validateTagGroupsConfig } from "./tag-groups-config";
import { getTagSummaries } from "./tag-service";

export type AiTagOrganizerResult = {
  groups: TagGroup[];
  notes?: string;
  model?: string;
};

async function resolveDefaultGroupCount(): Promise<number> {
  const configured = await getCurrentGroupCount();
  return configured > 0 ? configured : 8;
}

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export async function organizeTagsWithAI(options?: {
  targetGroups?: number;
  model?: string;
}): Promise<AiTagOrganizerResult> {
  const apiKey = assertEnv("OPENAI_API_KEY");
  const model =
    options?.model?.trim() ||
    process.env.TAG_AI_MODEL ||
    process.env.CHAT_COMPLETION_MODEL ||
    "gpt-4o-mini";
  const baseURL = process.env.OPENAI_API_BASE_URL || process.env.OPENAI_BASE_URL;
  const defaultCount = await resolveDefaultGroupCount();
  const targetGroups = options?.targetGroups ?? Number(process.env.TAG_GROUP_COUNT || defaultCount);

  const tagSummaries = await getTagSummaries({ includeDrafts: true, includeUnpublished: true });
  const tags = tagSummaries.map((t) => ({ name: t.name, count: t.count }));
  if (tags.length === 0) {
    return { groups: [], model };
  }
  const normalizeTagName = (value: string): string =>
    value.trim().normalize("NFKC").replace(/\s+/g, "");
  const tagLookup = new Map<string, string>();
  for (const tag of tags) {
    const key = normalizeTagName(tag.name);
    if (!tagLookup.has(key)) {
      tagLookup.set(key, tag.name);
    }
  }

  const systemPrompt = `You are a meticulous Chinese/English bilingual technical editor specialising in taxonomy design.
Return output that is strictly machine-readable JSON. Never include commentary, Markdown fences, or additional text.`;
  const tagLines = tags.map((t) => `- ${t.name} (usage=${t.count})`).join("\n");
  const userPrompt = [
    `Target group count: ${targetGroups}`,
    "Full list of tags (each must appear exactly once in the result, no invented tags):",
    tagLines,
    "",
    `Output Requirements (JSON object):`,
    `{
  "notes": "<concise rationale <=120 chars>",
  "groups": [
    {
      "key": "<slug-case identifier>",
      "title": "<short English noun without connectors like 'and' or '&'>",
      "tags": ["<full tag path>", "..."]
    }
  ]
}`,
    "Keep group sizes balanced (difference <= 2 when possible). Use camel hierarchy exactly as provided for tags.",
  ].join("\n");

  const openai = new OpenAI({ apiKey, baseURL });
  const maxAttempts = Number(process.env.TAG_AI_MAX_RETRY ?? 3);
  let completion: Awaited<ReturnType<typeof openai.chat.completions.create>> | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptLabel = `[ai-tag-organize attempt ${attempt}/${maxAttempts}]`;
    try {
      console.time(attemptLabel);
      completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
      });
      console.timeEnd(attemptLabel);
      break;
    } catch (error) {
      console.timeEnd(attemptLabel);
      const err = error as OpenAI.APIError & { response?: Response; status?: number };
      const body =
        err.response && !err.response.bodyUsed
          ? await err.response.text().catch(() => "<unreadable>")
          : undefined;
      console.error("[tag-ai] provider error", {
        status: err.status,
        message: err.message,
        type: (err as { type?: string }).type,
        body,
        raw: (err as { error?: unknown }).error,
        attempt,
      });
      console.error("[tag-ai] raw error object", err);

      const transientStatuses = [408, 429, 500, 502, 503, 504];
      const retryable =
        (err.status && transientStatuses.includes(err.status)) ||
        (err.status === 400 && err.message?.includes("Provider API error"));
      if (!retryable || attempt === maxAttempts) {
        throw error;
      }
      const waitMs = 1500 * attempt;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  if (!completion) {
    throw new Error("AI completion unavailable after retries");
  }

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("AI response missing content");
  }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
    throw new Error("AI output missing JSON object");
  }
  const jsonSlice = text.slice(firstBrace, lastBrace + 1);
  let parsed: { groups: TagGroup[]; notes?: string };
  try {
    parsed = JSON.parse(jsonSlice);
  } catch {
    console.error("[tag-ai] failed to parse JSON", { text });
    throw new Error("AI output is not valid JSON");
  }

  const seenNormalized = new Set<string>();
  for (const group of parsed.groups) {
    const canonicalTags: string[] = [];
    for (const tag of group.tags) {
      const key = normalizeTagName(tag);
      const original = tagLookup.get(key);
      if (!original) {
        throw new Error(`Tag not found in source list: ${tag}`);
      }
      if (seenNormalized.has(key)) {
        throw new Error(`Tag duplicated across groups: ${original}`);
      }
      seenNormalized.add(key);
      canonicalTags.push(original);
    }
    group.tags = canonicalTags;
  }
  const missing = tags
    .filter((tag) => !seenNormalized.has(normalizeTagName(tag.name)))
    .map((t) => t.name);
  if (missing.length) {
    parsed.groups.push({ key: "unassigned", title: "Unassigned", tags: missing });
  }

  const validation = validateTagGroupsConfig(
    { groups: parsed.groups },
    { knownTags: tags.map((t) => t.name) }
  );
  if (validation.valid === false) {
    throw new Error(`AI grouping failed validation: ${validation.errors.join("; ")}`);
  }

  return { groups: parsed.groups, notes: parsed.notes, model };
}
