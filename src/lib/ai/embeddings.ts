import crypto from "node:crypto";

const OPENAI_API_BASE_URL = process.env.OPENAI_API_BASE_URL || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 全局限流与冷却状态（进程内共享）
const GLOBAL_LIMITS = {
  maxInflight: Math.max(
    1,
    Number(process.env.EMBED_GLOBAL_MAX_INFLIGHT || process.env.MAX_EMBED_CONCURRENCY || 3)
  ),
  minIntervalMs: Math.max(0, Number(process.env.EMBED_MIN_INTERVAL_MS || 200)), // 节流：请求启动的最小间隔
  cooldownUntil: 0, // 命中 429/Retry-After 后的全局冷却截止时间
  // 默认全局冷却上限降为 2s，避免长等待（不新增配置项）
  cooldownMaxMs: Math.max(500, Number(process.env.EMBED_GLOBAL_COOLDOWN_MAX_MS || 2000)),
  inflight: 0,
  lastStart: 0,
  waiters: [] as Array<() => void>,
};

function notifyNext() {
  // 简单 FIFO 调度
  const next = GLOBAL_LIMITS.waiters.shift();
  if (next) {
    // 使用 setTimeout 0 以避免深度递归
    setTimeout(next, 0);
  }
}

async function acquireGlobalSlot(): Promise<void> {
  return new Promise((resolve) => {
    const attempt = () => {
      const now = Date.now();
      if (now < GLOBAL_LIMITS.cooldownUntil) {
        setTimeout(attempt, GLOBAL_LIMITS.cooldownUntil - now + 1);
        return;
      }
      if (GLOBAL_LIMITS.inflight >= GLOBAL_LIMITS.maxInflight) {
        GLOBAL_LIMITS.waiters.push(attempt);
        return;
      }
      const sinceLast = now - GLOBAL_LIMITS.lastStart;
      if (sinceLast < GLOBAL_LIMITS.minIntervalMs) {
        setTimeout(attempt, GLOBAL_LIMITS.minIntervalMs - sinceLast);
        return;
      }
      GLOBAL_LIMITS.inflight++;
      GLOBAL_LIMITS.lastStart = Date.now();
      resolve();
    };
    attempt();
  });
}

function releaseGlobalSlot() {
  GLOBAL_LIMITS.inflight = Math.max(0, GLOBAL_LIMITS.inflight - 1);
  notifyNext();
}

function applyGlobalCooldown(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return;
  const now = Date.now();
  // 若已在冷却期内，则不延长，避免多次 429 导致的持续推迟
  if (now < GLOBAL_LIMITS.cooldownUntil) return;
  const wait = Math.min(ms, GLOBAL_LIMITS.cooldownMaxMs);
  GLOBAL_LIMITS.cooldownUntil = now + wait;
}

type BackoffOptions = {
  retries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (info: {
    attempt: number;
    waitMs: number;
    reason: string;
    status?: number;
    retryAfterMs?: number;
  }) => void;
};

async function fetchWithBackoff(
  makeRequest: () => Promise<Response>,
  options?: BackoffOptions
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
        const retryAfterMs = parseRetryAfterHeader(retryAfter);
        let wait = typeof retryAfterMs === "number" ? retryAfterMs : delay;
        if (!Number.isFinite(wait) || wait <= 0) wait = delay;
        // jitter
        wait = Math.min(maxDelayMs, Math.floor(wait * (1 + Math.random() * 0.25)));
        // 后端日志：记录 429/5xx 重试与等待
        console.warn(
          `[embeddings] retryable response: status=${res.status} attempt=${attempt + 1} waitMs=${wait} retryAfterMs=${retryAfterMs ?? "n/a"}`
        );
        options?.onRetry?.({
          attempt: attempt + 1,
          waitMs: wait,
          reason: res.status === 429 ? "rate_limited" : "server_error",
          status: res.status,
          retryAfterMs,
        });
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
      console.warn(
        `[embeddings] network error on attempt ${attempt + 1}, waitMs=${wait}: ${String(err)}`
      );
      options?.onRetry?.({ attempt: attempt + 1, waitMs: wait, reason: "network_error" });
      await sleep(wait);
      attempt++;
      delay = Math.min(maxDelayMs, Math.floor(delay * 2));
    }
  }
}

// 解析 Retry-After header，支持秒数字或 HTTP-date
function parseRetryAfterHeader(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;
  const sec = Number(headerValue);
  if (Number.isFinite(sec)) return Math.max(0, sec * 1000);
  const when = Date.parse(headerValue);
  if (!Number.isNaN(when)) {
    const ms = when - Date.now();
    return ms > 0 ? ms : 0;
  }
  return undefined;
}

export type EmbeddingResponse = {
  model: string;
  dim: number;
  vector: number[];
};

export async function createEmbedding(
  input: string,
  model?: string,
  opts?: { onRetry?: BackoffOptions["onRetry"] }
): Promise<EmbeddingResponse> {
  if (!OPENAI_API_BASE_URL || !OPENAI_API_KEY) {
    throw new Error("OPENAI_API_BASE_URL or OPENAI_API_KEY is not configured");
  }

  const modelName = model || process.env.EMBEDDING_MODEL_NAME || "BAAI/bge-m3";

  const base = OPENAI_API_BASE_URL.replace(/\/$/, "");
  const apiBase = base.endsWith("/v1") ? base : `${base}/v1`;
  await acquireGlobalSlot();
  let res: Response | undefined;
  try {
    res = await fetchWithBackoff(
      () =>
        fetch(`${apiBase}/embeddings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({ model: modelName, input }),
        }),
      {
        retries: 5,
        initialDelayMs: 100,
        maxDelayMs: 3000,
        onRetry: (info) => {
          // 命中 429/Retry-After 或网络错误时，应用全局冷却，避免风暴式重试
          if (info.reason === "rate_limited" || info.status === 429) {
            applyGlobalCooldown(info.waitMs);
          }
          // 透传给调用方（用于日志）
          opts?.onRetry?.(info);
        },
      }
    );
  } finally {
    releaseGlobalSlot();
  }

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
