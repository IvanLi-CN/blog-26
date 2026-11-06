import { type AiUsageContext, meterProviderCall } from "@/lib/ai-usage";

export type WebSearchResult = { title: string; url: string; content: string };
export type WebSearchConfig = {
  baseUrl: string;
  token: string | null;
  maxSearches: number;
  timeoutMs: number;
};

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getWebSearchConfig(): WebSearchConfig {
  return {
    baseUrl: (process.env.TAVILY_BASE_URL?.trim() || "https://tavily.ivanli.cc/api/tavily").replace(
      /\/+$/u,
      ""
    ),
    token: process.env.TAVILY_API_KEY?.trim() || null,
    maxSearches: positiveInteger(process.env.ASSISTANT_MAX_WEB_SEARCHES, 12),
    timeoutMs: positiveInteger(process.env.TAVILY_TIMEOUT_MS, 20_000),
  };
}

export function safeWebUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export async function searchWeb(
  query: string,
  options: {
    config: WebSearchConfig;
    signal: AbortSignal;
    metering: AiUsageContext;
    callIndex: number;
    fetch?: typeof fetch;
  }
): Promise<WebSearchResult[]> {
  const { config, signal, metering, callIndex } = options;
  if (!config.token) throw new Error("web-search-unconfigured");
  const endpoint = new URL(`${config.baseUrl}/search`);
  if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password)
    throw new Error("web-search-invalid-config");
  return meterProviderCall({
    context: {
      ...metering,
      feature: "assistant-web-search",
      provider: "tavily-hikari",
      model: null,
      logicalRequestId: `${metering.logicalRequestId}:web:${callIndex}`,
      idempotencyKey: `${metering.generationJobId}:web:${callIndex}`,
      chargePersonalQuota: false,
      chargeQuestion: false,
      inputEstimateTokens: 0,
      outputEstimateTokens: 0,
      metadata: { searchCalls: 1 },
    },
    call: async () => {
      const response = await (options.fetch ?? fetch)(endpoint, {
        method: "POST",
        signal: AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)]),
        headers: { "content-type": "application/json", authorization: `Bearer ${config.token}` },
        body: JSON.stringify({
          query,
          max_results: 6,
          search_depth: "advanced",
          include_answer: false,
        }),
        redirect: "error",
      });
      // Never surface upstream bodies: they may echo credentials or request data.
      if (!response.ok) throw new Error(`web-search-http-${response.status}`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("web-search-empty-response");
      let body = "";
      let bytes = 0;
      const decoder = new TextDecoder();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 2 * 1024 * 1024) throw new Error("web-search-response-too-large");
          body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      const payload = JSON.parse(body) as { results?: unknown };
      if (!Array.isArray(payload.results)) throw new Error("web-search-invalid-response");
      return payload.results.slice(0, 6).flatMap((result: unknown) => {
        if (!result || typeof result !== "object") return [];
        const item = result as Record<string, unknown>;
        const url = safeWebUrl(item.url);
        if (!url || typeof item.title !== "string" || typeof item.content !== "string") return [];
        return [{ url, title: item.title.slice(0, 500), content: item.content.slice(0, 8000) }];
      });
    },
    getOutcome: () => ({
      status: "success",
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    }),
  });
}
