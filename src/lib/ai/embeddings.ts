import crypto from "node:crypto";

const OPENAI_API_BASE_URL = process.env.OPENAI_API_BASE_URL || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithBackoff(
  makeRequest: () => Promise<Response>,
  options?: { retries?: number; initialDelayMs?: number; maxDelayMs?: number }
): Promise<Response> {
  const retries = options?.retries ?? 5;
  const initialDelayMs = options?.initialDelayMs ?? 100;
  const maxDelayMs = options?.maxDelayMs ?? 3000;

  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      const res = await makeRequest();
      if (res.ok) return res;

      // Retry on 429 or 5xx
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= retries) return res; // give up and let caller handle
        // Respect Retry-After when available
        const retryAfter = res.headers.get("retry-after");
        let wait = retryAfter ? Number(retryAfter) * 1000 : delay;
        if (!Number.isFinite(wait) || wait <= 0) wait = delay;
        // jitter
        wait = Math.min(maxDelayMs, Math.floor(wait * (1 + Math.random() * 0.25)));
        await sleep(wait);
        attempt++;
        delay = Math.min(maxDelayMs, Math.floor(delay * 2));
        continue;
      }

      return res;
    } catch (err) {
      // network error: retry with backoff
      if (attempt >= retries) throw err;
      const wait = Math.min(maxDelayMs, Math.floor(delay * (1 + Math.random() * 0.25)));
      await sleep(wait);
      attempt++;
      delay = Math.min(maxDelayMs, Math.floor(delay * 2));
    }
  }
}

export type EmbeddingResponse = {
  model: string;
  dim: number;
  vector: number[];
};

export async function createEmbedding(input: string, model?: string): Promise<EmbeddingResponse> {
  if (!OPENAI_API_BASE_URL || !OPENAI_API_KEY) {
    throw new Error("OPENAI_API_BASE_URL or OPENAI_API_KEY is not configured");
  }

  const modelName = model || process.env.EMBEDDING_MODEL_NAME || "BAAI/bge-m3";

  const base = OPENAI_API_BASE_URL.replace(/\/$/, "");
  const apiBase = base.endsWith("/v1") ? base : `${base}/v1`;
  const res = await fetchWithBackoff(
    () =>
      fetch(`${apiBase}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model: modelName, input }),
      }),
    { retries: 5, initialDelayMs: 100, maxDelayMs: 3000 }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Embedding request failed: ${res.status} ${res.statusText} ${text}`);
  }

  const json: any = await res.json();
  const data = json?.data?.[0];
  if (!data?.embedding || !Array.isArray(data.embedding)) {
    throw new Error("Invalid embedding response");
  }
  const vector = data.embedding as number[];
  const dim = vector.length;
  return { model: modelName, dim, vector };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function float32ArrayToBlobBuffer(arr: number[] | Float32Array): Buffer {
  const f32 = arr instanceof Float32Array ? arr : new Float32Array(arr);
  return Buffer.from(f32.buffer);
}

export function hashEmbeddingInput(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function buildEmbeddingInput(post: {
  title?: string | null;
  excerpt?: string | null;
  body?: string | null;
}): string {
  const parts: string[] = [];
  if (post.title) parts.push(`# ${post.title}`);
  if (post.excerpt) parts.push(post.excerpt);
  if (post.body) parts.push(post.body);
  return parts.join("\n\n");
}
