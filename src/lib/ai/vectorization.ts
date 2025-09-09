import { and, eq, inArray } from "drizzle-orm";
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
        title: (p as any).title,
        excerpt: (p as any).excerpt,
        body: p.body,
      });
      const contentHash = hashEmbeddingInput(input);

      if (chunking) {
        const chunks = chunkText(input, chunkSize, chunkOverlap);
        for (const ch of chunks) {
          const { vector, dim } = await createEmbedding(ch.text, modelName);
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
        }
      } else {
        const { vector, dim } = await createEmbedding(input, modelName);
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

  const rows = await db.select().from(posts).where(eq(posts.slug, params.slug));
  if (rows.length === 0) throw new Error(`Post not found: ${params.slug}`);
  const p = rows[0]!;

  const input = buildEmbeddingInput(p as any);
  const contentHash = hashEmbeddingInput(input);

  if (chunking) {
    const chunks = chunkText(input, chunkSize, chunkOverlap);
    for (const ch of chunks) {
      const { vector, dim } = await createEmbedding(ch.text, modelName);
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
    }
  } else {
    const { vector, dim } = await createEmbedding(input, modelName);
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
