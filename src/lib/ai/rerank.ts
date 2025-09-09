const OPENAI_API_BASE_URL = process.env.OPENAI_API_BASE_URL || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

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

export async function rerank(
  query: string,
  documents: string[],
  opts?: { model?: string; topN?: number }
): Promise<RerankItem[]> {
  const modelName = opts?.model || process.env.RERANKER_MODEL_NAME;
  if (!modelName) {
    const err: any = new Error("RERANKER_UNAVAILABLE");
    err.code = "RERANKER_UNAVAILABLE";
    throw err;
  }
  if (!OPENAI_API_BASE_URL || !OPENAI_API_KEY) {
    throw new Error("OPENAI_API_BASE_URL or OPENAI_API_KEY is not configured");
  }

  const payload = { model: modelName, query, documents, top_n: opts?.topN } as any;
  const base = OPENAI_API_BASE_URL.replace(/\/$/, "");
  const apiBase = base.endsWith("/v1") ? base : `${base}/v1`;
  const res = await fetchWithBackoff(
    () =>
      fetch(`${apiBase}/rerank`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(payload),
      }),
    { retries: 3, initialDelayMs: 100, maxDelayMs: 3000 }
  );

  if (!res.ok) {
    // 标准化为不可用错误，不做降级
    const err: any = new Error("RERANKER_UNAVAILABLE");
    err.code = "RERANKER_UNAVAILABLE";
    try {
      err.details = await res.text();
    } catch {}
    throw err;
  }

  const json: any = await res.json();
  const items = (json?.data || []) as RerankItem[];
  return items;
}
