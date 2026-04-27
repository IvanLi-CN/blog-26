import OpenAI from "openai";
import { getResolvedLlmConfig } from "@/server/services/llm-settings";
import type { TagGroup } from "@/types/tag-groups";
import { getCurrentGroupCount, validateTagGroupsConfig } from "./tag-groups";
import { getTagSummaries } from "./tag-service";

export type AiTagOrganizerResult = {
  groups: TagGroup[];
  notes?: string;
  model?: string;
  summaryTitle?: string;
};

async function resolveDefaultGroupCount(): Promise<number> {
  const configured = await getCurrentGroupCount();
  return configured > 0 ? configured : 8;
}

export async function organizeTagsWithAI(options?: {
  targetGroups?: number;
  model?: string;
  signal?: AbortSignal;
}): Promise<AiTagOrganizerResult> {
  const resolved = await getResolvedLlmConfig();
  const apiKey = resolved.chat.apiKey;
  const model = options?.model?.trim() || resolved.chat.model || "gpt-4o-mini";
  const baseURL = resolved.chat.baseUrl || undefined;
  const { signal } = options ?? {};
  if (!apiKey) {
    throw new Error("Chat model API key is not configured");
  }
  const throwIfAborted = () => {
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted", "AbortError");
    }
  };
  throwIfAborted();
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

  const systemPrompt = `You are an information architect for a technical blog. Return ONLY valid JSON with no markdown fences or commentary. If you cannot honour every rule from the user, reply with {"error":"reason"}.`;
  const idealMin = Math.floor(tags.length / targetGroups);
  const idealMax = Math.ceil(tags.length / targetGroups);
  const groupSizeRule =
    idealMin === idealMax
      ? `Every group must contain exactly ${idealMax} tags.`
      : `Each group must contain ${idealMin} or ${idealMax} tags; the difference between any two groups may not exceed 1.`;
  const tagCatalogue = tagSummaries
    .map((t) => {
      const segments = t.segments?.length ? t.segments.join(" > ") : (t.lastSegment ?? t.name);
      return `- ${t.name} | segments: ${segments} | usage=${t.count}`;
    })
    .join("\n");
  const exampleJson = `{
  "summaryTitle": "硬软协奏",
  "notes": "Split content vs infrastructure; counts balanced 2/2",
  "groups": [
    {
      "key": "content-operations",
      "title": "Content Operations",
      "tags": ["content/cms", "content/editorial"]
    },
    {
      "key": "platform",
      "title": "Platform",
      "tags": ["infra/docker", "infra/kubernetes"]
    }
  ]
}`;
  const userPrompt = [
    `We have ${tags.length} distinct tags used across the blog. Each tag string is a full path and must appear exactly once in the output.`,
    `Target number of groups: ${targetGroups}. ${groupSizeRule}`,
    "",
    "Tag catalogue (format: <tag path> | segments | usage count):",
    tagCatalogue,
    "",
    "Rules:",
    "1. Do not invent, rename, merge, or split tags. Copy the tag path verbatim (case, spaces, slashes).",
    "2. Choose concise English nouns for titles—no connectors such as 'and', '&', '/', or '+'.",
    "3. Generate slug-case keys derived from the title (lowercase, hyphen).",
    "4. Create sharp, domain-specific themes (e.g. Observability, ContentOps, Frontend). Avoid vague buckets like 'API' or 'General'.",
    "5. Keep semantically related tags together. Use path segments and usage counts as hints when interpreting domain meaning.",
    "6. If perfect balance is impossible, explain why in 'notes' and deviate by the minimal amount.",
    "7. Populate 'summaryTitle' with a vivid yet concise Chinese phrase (<=8 characters) that conveys the overall vibe of the taxonomy. Do not enumerate group titles or use punctuation like '·'; instead blend concepts into a single abstract descriptor (e.g. '硬软协奏', '技术脉络').",
    "",
    "JSON response schema:",
    `{
  "summaryTitle": "<<=8个中文字符的抽象短语>",
  "notes": "<=200 chars explaining the clustering logic or imbalances",
  "groups": [
    {
      "key": "<slug-case>",
      "title": "<short noun phrase>",
      "tags": [
        "<exact tag path>",
        "..."
      ]
    }
  ]
}`,
    "",
    "Example (illustrative only; never reuse these sample tags):",
    exampleJson,
  ].join("\n");

  const openai = new OpenAI({ apiKey, baseURL });
  const maxAttempts = Number(process.env.TAG_AI_MAX_RETRY ?? 3);
  let completion: Awaited<ReturnType<typeof openai.chat.completions.create>> | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptLabel = `[ai-tag-organize attempt ${attempt}/${maxAttempts}]`;
    try {
      throwIfAborted();
      console.time(attemptLabel);
      completion = await openai.chat.completions.create(
        {
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.2,
        },
        { signal }
      );
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
      if (signal?.aborted) {
        throw new DOMException("The operation was aborted", "AbortError");
      }
      if (!retryable || attempt === maxAttempts) {
        throw error;
      }
      const waitMs = 1500 * attempt;
      if (signal) {
        await Promise.race([
          new Promise((resolve) => setTimeout(resolve, waitMs)),
          new Promise((_, reject) => {
            signal.addEventListener(
              "abort",
              () => reject(new DOMException("The operation was aborted", "AbortError")),
              { once: true }
            );
          }),
        ]);
      } else {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }

  if (!completion) {
    throw new Error("AI completion unavailable after retries");
  }

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("AI response missing content");
  }
  throwIfAborted();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
    throw new Error("AI output missing JSON object");
  }
  const jsonSlice = text.slice(firstBrace, lastBrace + 1);
  let parsed: { groups: TagGroup[]; notes?: string; summaryTitle?: string };
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

  const normalizedSummary =
    typeof parsed.summaryTitle === "string" ? parsed.summaryTitle.trim() : undefined;
  const fallbackSummary = "技术脉络";

  return {
    groups: parsed.groups,
    notes: parsed.notes,
    model,
    summaryTitle: normalizedSummary || (fallbackSummary ? fallbackSummary : undefined),
  };
}
