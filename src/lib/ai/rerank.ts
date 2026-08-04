import { getResolvedLlmConfig } from "@/server/services/llm-settings";

type LlmConfigResolver = typeof getResolvedLlmConfig;

let resolveLlmConfig: LlmConfigResolver = getResolvedLlmConfig;

export function setRerankConfigResolverForTest(resolver?: LlmConfigResolver) {
  resolveLlmConfig = resolver ?? getResolvedLlmConfig;
}

interface RerankerUnavailable extends Error {
  code: "RERANKER_UNAVAILABLE";
  details?: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithBackoff(
  makeRequest: () => Promise<Response>,
  options?: { retries?: number; initialDelayMs?: number; maxDelayMs?: number }
): Promise<Response> {
  const retries = options?.retries ?? 3;
  const initialDelayMs = options?.initialDelayMs ?? 100;
  const maxDelayMs = options?.maxDelayMs ?? 3000;

  let attempt = 0;
  let delay = initialDelayMs;
  while (true) {
    try {
      const res = await makeRequest();
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= retries) return res;
        const retryAfter = res.headers.get("retry-after");
        let wait = retryAfter ? Number(retryAfter) * 1000 : delay;
        if (!Number.isFinite(wait) || wait <= 0) wait = delay;
        wait = Math.min(maxDelayMs, Math.floor(wait * (1 + Math.random() * 0.25)));
        await sleep(wait);
        attempt++;
        delay = Math.min(maxDelayMs, Math.floor(delay * 2));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt >= retries) throw err;
      const wait = Math.min(maxDelayMs, Math.floor(delay * (1 + Math.random() * 0.25)));
      await sleep(wait);
      attempt++;
      delay = Math.min(maxDelayMs, Math.floor(delay * 2));
    }
  }
}

export type RerankItem = { index: number; document: string; score: number };

function createRerankerUnavailable(details?: string) {
  const err = new Error("RERANKER_UNAVAILABLE") as RerankerUnavailable;
  err.code = "RERANKER_UNAVAILABLE";
  if (details) err.details = details;
  return err;
}

function getRerankBaseHost(apiBase: string) {
  try {
    return new URL(apiBase).host;
  } catch {
    return "invalid-url";
  }
}

function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value === null || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (/authorization|api[_-]?key|token|secret|password|documents?/i.test(key)) {
        return [key, "[redacted]"];
      }
      return [key, redactSensitive(item)];
    })
  );
}

function summarizeBody(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "";

  try {
    return JSON.stringify(redactSensitive(JSON.parse(compact))).slice(0, 500);
  } catch {
    return compact
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
      .replace(/sk-[A-Za-z0-9._~+/=-]+/g, "sk-[redacted]")
      .slice(0, 500);
  }
}

function logRerankIssue(
  message: string,
  context: {
    model: string;
    apiBase: string;
    status?: number;
    bodySummary?: string;
    resultCount?: number;
    validItemCount?: number;
    reason?: string;
  }
) {
  console.warn("[rerank]", {
    message,
    model: context.model,
    baseHost: getRerankBaseHost(context.apiBase),
    status: context.status,
    bodySummary: context.bodySummary,
    resultCount: context.resultCount,
    validItemCount: context.validItemCount,
    reason: context.reason,
  });
}

function readScore(value: Record<string, unknown>) {
  if (typeof value.score === "number") return value.score;
  if (typeof value.relevance_score === "number") return value.relevance_score;
  return null;
}

export function parseRerankResponse(payload: unknown) {
  const source = payload as { data?: unknown; results?: unknown };
  const rawItems = Array.isArray(source.data)
    ? source.data
    : Array.isArray(source.results)
      ? source.results
      : [];

  const items = rawItems
    .map((it, index) => {
      if (it === null || typeof it !== "object") return null;
      const o = it as Record<string, unknown>;
      const score = readScore(o);
      if (score === null || !Number.isFinite(score)) return null;
      const i = o.index === undefined ? index : o.index;
      if (typeof i !== "number" || !Number.isInteger(i)) return null;
      const document = typeof o.document === "string" ? o.document : "";
      return { index: i, document, score } satisfies RerankItem;
    })
    .filter((item): item is RerankItem => item !== null);

  return { items, rawItemCount: rawItems.length };
}

export async function rerank(
  query: string,
  documents: string[],
  opts?: { model?: string; topN?: number }
): Promise<RerankItem[]> {
  const resolved = await resolveLlmConfig();
  const modelName = opts?.model || resolved.rerank.model;
  if (!modelName) {
    throw createRerankerUnavailable();
  }
  const apiBase = resolved.rerank.baseUrl;
  const apiKey = resolved.rerank.apiKey;
  if (!apiBase || !apiKey) {
    throw new Error("Rerank model/baseUrl/apiKey is not configured");
  }

  const payload: { model: string; query: string; documents: string[]; top_n?: number } = {
    model: modelName,
    query,
    documents,
    top_n: opts?.topN,
  };
  const res = await fetchWithBackoff(
    () =>
      fetch(`${apiBase}/rerank`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      }),
    { retries: 3, initialDelayMs: 100, maxDelayMs: 3000 }
  );

  if (!res.ok) {
    let details = "";
    try {
      details = await res.text();
    } catch {
      /* ignore: response body may be empty or stream already consumed */
    }
    logRerankIssue("upstream returned non-ok response", {
      model: modelName,
      apiBase,
      status: res.status,
      bodySummary: summarizeBody(details),
    });
    throw createRerankerUnavailable(details);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (error) {
    logRerankIssue("failed to parse upstream JSON response", {
      model: modelName,
      apiBase,
      status: res.status,
      reason: error instanceof Error ? error.message : String(error),
    });
    throw createRerankerUnavailable("Invalid rerank JSON response");
  }

  const { items, rawItemCount } = parseRerankResponse(json);
  if (items.length === 0) {
    logRerankIssue("upstream response did not contain usable rerank items", {
      model: modelName,
      apiBase,
      status: res.status,
      resultCount: rawItemCount,
      validItemCount: items.length,
    });
    throw createRerankerUnavailable("Rerank response did not contain usable scores");
  }

  const expectedItemCount = Math.min(opts?.topN ?? documents.length, documents.length);
  const indices = new Set<number>();
  let hasInvalidIndex = false;
  for (const item of items) {
    if (item.index < 0 || item.index >= documents.length || indices.has(item.index)) {
      hasInvalidIndex = true;
      break;
    }
    indices.add(item.index);
  }
  if (rawItemCount !== items.length || hasInvalidIndex || items.length !== expectedItemCount) {
    logRerankIssue("upstream response contained unusable rerank scores", {
      model: modelName,
      apiBase,
      status: res.status,
      resultCount: rawItemCount,
      validItemCount: items.length,
    });
    throw createRerankerUnavailable("Rerank response contained invalid item indexes");
  }

  return items;
}
