import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { postEmbeddings } from "../schema";

export type VectorizationStatus = "indexed" | "unindexed" | "outdated";

export const EmbeddingsRepository = {
  async upsert(params: {
    id: string;
    postId: string;
    slug: string;
    type: string;
    modelName: string;
    dim: number;
    contentHash: string;
    chunkIndex: number | null;
    vector: Buffer | null;
    errorMessage?: string | null;
    timestamp?: number;
  }) {
    const now = params.timestamp ?? Date.now();
    await db
      .insert(postEmbeddings)
      .values({
        id: params.id,
        postId: params.postId,
        slug: params.slug,
        type: params.type,
        modelName: params.modelName,
        dim: params.dim,
        contentHash: params.contentHash,
        chunkIndex: params.chunkIndex ?? -1,
        vector: params.vector ?? null,
        errorMessage: params.errorMessage ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [postEmbeddings.postId, postEmbeddings.modelName, postEmbeddings.chunkIndex],
        set: {
          slug: params.slug,
          type: params.type,
          dim: params.dim,
          contentHash: params.contentHash,
          vector: params.vector ?? null,
          errorMessage: params.errorMessage ?? null,
          updatedAt: now,
        },
      });
  },

  async getByPost(postId: string, modelName: string) {
    return db
      .select()
      .from(postEmbeddings)
      .where(and(eq(postEmbeddings.postId, postId), eq(postEmbeddings.modelName, modelName)))
      .orderBy(postEmbeddings.chunkIndex);
  },

  async getLatestUpdatedAt(modelName: string) {
    const rows = await db
      .select({ latest: sql<number>`max(${postEmbeddings.updatedAt})` })
      .from(postEmbeddings)
      .where(eq(postEmbeddings.modelName, modelName));
    return rows[0]?.latest ?? 0;
  },

  async getVectorizationStatus(
    postId: string,
    modelName: string,
    currentHash: string
  ): Promise<VectorizationStatus> {
    const rows = await this.getByPost(postId, modelName);
    if (rows.length === 0) return "unindexed";
    const allMatch = rows.every((r) => r.contentHash === currentHash && r.vector != null);
    return allMatch ? "indexed" : "outdated";
  },

  async stats(modelName: string) {
    const totalRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(postEmbeddings)
      .where(eq(postEmbeddings.modelName, modelName));

    const indexedRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(postEmbeddings)
      .where(and(eq(postEmbeddings.modelName, modelName), isNull(postEmbeddings.errorMessage)));

    return {
      model: modelName,
      total: totalRows[0]?.count ?? 0,
      indexed: indexedRows[0]?.count ?? 0,
      lastUpdatedAt: await this.getLatestUpdatedAt(modelName),
    };
  },
};
