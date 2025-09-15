import { eq, inArray } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { db, initializeDB } from "../db";
import { posts } from "../schema";
import { syncEventManager } from "../sync-events";
import {
  buildEmbeddingInput,
  createEmbedding,
  float32ArrayToBlobBuffer,
  hashEmbeddingInput,
} from "./embeddings";
import { EmbeddingsRepository } from "./embeddings-repo";

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 16);

export type VectorizeMode = "full" | "incremental";

type Chunk = { index: number; text: string };

function chunkText(text: string, size: number, overlap: number): Chunk[] {
  if (size <= 0) return [{ index: 0, text }];
  const chunks: Chunk[] = [];
  let start = 0;
  let idx = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + size);
    chunks.push({ index: idx++, text: text.slice(start, end) });
    if (end === text.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length) as R[];
  let next = 0;
  const running: Promise<void>[] = [];
  async function runOne(i: number) {
    const r = await worker(items[i] as T, i);
    results[i] = r;
  }
  while (next < items.length || running.length > 0) {
    while (next < items.length && running.length < Math.max(1, limit)) {
      const i = next++;
      const p = runOne(i).then(() => {
        const idx = running.indexOf(p);
        if (idx >= 0) running.splice(idx, 1);
      });
      running.push(p);
    }
    if (running.length > 0) await Promise.race(running);
  }
  return results;
}

export async function vectorizeAll(params: {
  isFull: boolean;
  model?: string;
  chunking?: boolean;
}) {
  await initializeDB();
  const modelName = params.model || process.env.EMBEDDING_MODEL_NAME || "BAAI/bge-m3";
  const chunking = params.chunking ?? process.env.EMBED_CHUNKING_ENABLED !== "false";
  const chunkSize = Number(process.env.EMBED_CHUNK_SIZE || 1400);
  const chunkOverlap = Number(process.env.EMBED_CHUNK_OVERLAP || 200);
  const maxEmbedConcurrency = Math.max(1, Number(process.env.MAX_EMBED_CONCURRENCY || 3));

  const syncId = syncEventManager.startSyncSession(params.isFull ? "full" : "incremental");
  syncEventManager.pushLog({
    id: nanoid(),
    sourceType: "vector",
    sourceName: "post_embeddings",
    operation: "vectorize",
    status: "success",
    message: `开始向量化任务（${params.isFull ? "全量" : "增量"}），模型：${modelName}`,
    createdAt: Date.now(),
  });

  // 只处理 post/memo 类型
  const targetTypes = ["post", "memo"] as const;
  const allPosts = await db
    .select({
      id: posts.id,
      slug: posts.slug,
      type: posts.type,
      contentHash: posts.contentHash,
      body: posts.body,
      title: posts.title,
      excerpt: posts.excerpt,
      draft: posts.draft,
      public: posts.public,
    })
    .from(posts)
    .where(inArray(posts.type, targetTypes as unknown as string[]));

  const total = allPosts.length;
  let processed = 0;
  let success = 0;
  let failed = 0;

  for (const p of allPosts) {
    processed++;
    try {
      const status = await EmbeddingsRepository.getVectorizationStatus(
        p.id,
        modelName,
        p.contentHash
      );
      if (!params.isFull && status === "indexed") {
        syncEventManager.pushLog({
          id: nanoid(),
          sourceType: "vector",
          sourceName: "post_embeddings",
          operation: "vectorize",
          status: "success",
          message: `跳过（已索引）: ${p.slug}`,
          filePath: p.slug,
          createdAt: Date.now(),
        });
        continue;
      }

      const input = buildEmbeddingInput({
        title: p.title,
        excerpt: p.excerpt,
        body: p.body,
      });
      const contentHash = hashEmbeddingInput(input);

      if (chunking) {
        const chunks = chunkText(input, chunkSize, chunkOverlap);
        await mapWithConcurrency(chunks, maxEmbedConcurrency, async (ch) => {
          const { vector, dim } = await createEmbedding(ch.text, modelName, {
            onRetry: ({ attempt, waitMs, reason, status, retryAfterMs }) => {
              syncEventManager.pushLog({
                id: nanoid(),
                sourceType: "vector",
                sourceName: "post_embeddings",
                operation: "vectorize",
                status: "warning",
                message: `向量化重试 第${attempt}次，等待 ${waitMs}ms（原因：${reason}${status ? ` ${status}` : ""}${retryAfterMs != null ? ` · Retry-After: ${Math.round(retryAfterMs / 1000)}s` : ""}）：${p.slug}#${ch.index}`,
                filePath: p.slug,
                createdAt: Date.now(),
              });
            },
          });
          await EmbeddingsRepository.upsert({
            id: nanoid(),
            postId: p.id,
            slug: p.slug,
            type: p.type,
            modelName,
            dim,
            contentHash,
            chunkIndex: ch.index,
            vector: float32ArrayToBlobBuffer(vector),
          });
        });
      } else {
        const { vector, dim } = await createEmbedding(input, modelName, {
          onRetry: ({ attempt, waitMs, reason, status, retryAfterMs }) => {
            syncEventManager.pushLog({
              id: nanoid(),
              sourceType: "vector",
              sourceName: "post_embeddings",
              operation: "vectorize",
              status: "warning",
              message: `向量化重试 第${attempt}次，等待 ${waitMs}ms（原因：${reason}${status ? ` ${status}` : ""}${retryAfterMs != null ? ` · Retry-After: ${Math.round(retryAfterMs / 1000)}s` : ""}）：${p.slug}`,
              filePath: p.slug,
              createdAt: Date.now(),
            });
          },
        });
        await EmbeddingsRepository.upsert({
          id: nanoid(),
          postId: p.id,
          slug: p.slug,
          type: p.type,
          modelName,
          dim,
          contentHash,
          chunkIndex: -1,
          vector: float32ArrayToBlobBuffer(vector),
        });
      }

      success++;
      syncEventManager.pushLog({
        id: nanoid(),
        sourceType: "vector",
        sourceName: "post_embeddings",
        operation: "vectorize",
        status: "success",
        message: `向量化成功: ${p.slug}`,
        filePath: p.slug,
        createdAt: Date.now(),
      });
    } catch (err) {
      failed++;
      syncEventManager.pushLog({
        id: nanoid(),
        sourceType: "vector",
        sourceName: "post_embeddings",
        operation: "vectorize",
        status: "error",
        message: `向量化失败: ${p.slug} - ${(err as Error).message}`,
        filePath: p.slug,
        data: { error: String(err) },
        createdAt: Date.now(),
      });
    }
  }

  const stats = { total, processed, success, failed, model: modelName };
  syncEventManager.completeSyncSession(true, stats);
  return { syncId, stats };
}

export async function vectorizeOneBySlug(params: {
  slug: string;
  model?: string;
  chunking?: boolean;
}) {
  await initializeDB();
  const modelName = params.model || process.env.EMBEDDING_MODEL_NAME || "BAAI/bge-m3";
  const chunking = params.chunking ?? process.env.EMBED_CHUNKING_ENABLED !== "false";
  const chunkSize = Number(process.env.EMBED_CHUNK_SIZE || 1400);
  const chunkOverlap = Number(process.env.EMBED_CHUNK_OVERLAP || 200);
  const maxEmbedConcurrency = Math.max(1, Number(process.env.MAX_EMBED_CONCURRENCY || 3));

  const rows = await db.select().from(posts).where(eq(posts.slug, params.slug));
  if (rows.length === 0) throw new Error(`Post not found: ${params.slug}`);
  const p = rows[0]!;

  const input = buildEmbeddingInput({ title: p.title, excerpt: p.excerpt, body: p.body });
  const contentHash = hashEmbeddingInput(input);

  if (chunking) {
    const chunks = chunkText(input, chunkSize, chunkOverlap);
    await mapWithConcurrency(chunks, maxEmbedConcurrency, async (ch) => {
      const { vector, dim } = await createEmbedding(ch.text, modelName, {
        onRetry: ({ attempt, waitMs, reason, status, retryAfterMs }) => {
          syncEventManager.pushLog({
            id: nanoid(),
            sourceType: "vector",
            sourceName: "post_embeddings",
            operation: "vectorize",
            status: "warning",
            message: `向量化重试 第${attempt}次，等待 ${waitMs}ms（原因：${reason}${status ? ` ${status}` : ""}${retryAfterMs != null ? ` · Retry-After: ${Math.round(retryAfterMs / 1000)}s` : ""}）：${p.slug}#${ch.index}`,
            filePath: p.slug,
            createdAt: Date.now(),
          });
        },
      });
      await EmbeddingsRepository.upsert({
        id: nanoid(),
        postId: p.id,
        slug: p.slug,
        type: p.type,
        modelName,
        dim,
        contentHash,
        chunkIndex: ch.index,
        vector: float32ArrayToBlobBuffer(vector),
      });
    });
  } else {
    const { vector, dim } = await createEmbedding(input, modelName, {
      onRetry: ({ attempt, waitMs, reason, status, retryAfterMs }) => {
        syncEventManager.pushLog({
          id: nanoid(),
          sourceType: "vector",
          sourceName: "post_embeddings",
          operation: "vectorize",
          status: "warning",
          message: `向量化重试 第${attempt}次，等待 ${waitMs}ms（原因：${reason}${status ? ` ${status}` : ""}${retryAfterMs != null ? ` · Retry-After: ${Math.round(retryAfterMs / 1000)}s` : ""}）：${p.slug}`,
          filePath: p.slug,
          createdAt: Date.now(),
        });
      },
    });
    await EmbeddingsRepository.upsert({
      id: nanoid(),
      postId: p.id,
      slug: p.slug,
      type: p.type,
      modelName,
      dim,
      contentHash,
      chunkIndex: -1,
      vector: float32ArrayToBlobBuffer(vector),
    });
  }

  return { updated: true };
}
