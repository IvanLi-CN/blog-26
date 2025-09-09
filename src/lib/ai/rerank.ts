const OPENAI_API_BASE_URL = process.env.OPENAI_API_BASE_URL || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

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
  const res = await fetch(`${apiBase}/rerank`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

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
