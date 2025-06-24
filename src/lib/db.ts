import { Database } from 'bun:sqlite';
import path from 'node:path';
import { eq, isNotNull } from 'drizzle-orm'; // Import isNotNull
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { type NewVectorizedFile, type VectorizedFile, vectorizedFiles } from './schema';

const DB_PATH = process.env.DB_PATH || './sqlite.db';
const resolvedDBPath = path.resolve(process.cwd(), DB_PATH);

export type DBRecord = VectorizedFile; // Use Drizzle's inferred type

export let db: ReturnType<typeof drizzle<Record<string, never>>>;

export async function initializeDB(): Promise<void> {
  if (db) return; // Already initialized
  try {
    const sqlite = new Database(resolvedDBPath);
    db = drizzle(sqlite);
    console.log('Connected to the SQLite database at', resolvedDBPath);
    // Drizzle-kit will handle table creation/migrations
    console.log('Drizzle ORM initialized.');
  } catch (err) {
    console.error('Error initializing database with Drizzle', (err as Error).message);
    throw err;
  }
}

export async function getFileRecord(filepath: string): Promise<VectorizedFile | null> {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDB() first.');
  }
  const record = db.select().from(vectorizedFiles).where(eq(vectorizedFiles.filepath, filepath)).get();
  return record || null;
}

export async function upsertFileRecord(record: NewVectorizedFile): Promise<void> {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDB() first.');
  }
  await db
    .insert(vectorizedFiles)
    .values(record)
    .onConflictDoUpdate({
      target: vectorizedFiles.filepath,
      set: {
        slug: record.slug,
        contentHash: record.contentHash,
        lastModifiedTime: record.lastModifiedTime,
        contentUpdatedAt: record.contentUpdatedAt,
        indexedAt: record.indexedAt,
        modelName: record.modelName,
        vector: record.vector,
      },
    });
}

export async function deleteFileRecord(filepath: string): Promise<void> {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDB() first.');
  }
  await db.delete(vectorizedFiles).where(eq(vectorizedFiles.filepath, filepath));
}

export async function getAllFileRecords(): Promise<VectorizedFile[]> {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDB() first.');
  }
  const records = db.select().from(vectorizedFiles).all();
  return records;
}

// Helper function to calculate cosine similarity between two vectors (Buffers)
function cosineSimilarity(vec1: Buffer, vec2: Buffer): number {
  if (vec1.length !== vec2.length) {
    throw new Error('Vectors must have the same dimension for cosine similarity.');
  }

  const arr1 = new Float32Array(vec1.buffer, vec1.byteOffset, vec1.byteLength / 4);
  const arr2 = new Float32Array(vec2.buffer, vec2.byteOffset, vec2.byteLength / 4);

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < arr1.length; i++) {
    dotProduct += arr1[i] * arr2[i];
    normA += arr1[i] * arr1[i];
    normB += arr2[i] * arr2[i];
  }

  if (normA === 0 || normB === 0) {
    return 0; // Avoid division by zero
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function findSimilarFiles(
  queryVector: Buffer,
  limit: number = 5
): Promise<(VectorizedFile & { score: number })[]> {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDB() first.');
  }

  // Fetch all records with vectors
  const recordsWithVectors = db.select().from(vectorizedFiles).where(isNotNull(vectorizedFiles.vector)).all(); // Use isNotNull function

  // Calculate similarity and sort
  const results = recordsWithVectors
    .map((row) => {
      // Ensure row.vector is a Buffer before calculating similarity
      if (row.vector instanceof Buffer) {
        const score = cosineSimilarity(queryVector, row.vector);
        return { ...row, score };
      }
      return null; // Skip records without a vector
    })
    .filter((row) => row !== null) as (VectorizedFile & { score: number })[]; // Filter out nulls and assert type

  results.sort((a, b) => b.score - a.score); // Sort by score descending

  // 返回 top N results
  return results.slice(0, limit).map((result) => ({
    ...result,
    content: 'This is a placeholder content.', // 添加 content 属性
  }));
}

// Optional: Close the database connection when the application exits
// This might be more relevant for long-running services.
// For a script, it might not be strictly necessary if the process exits cleanly.
// Drizzle with bun:sqlite might not need explicit close in this context.
export async function closeDB(): Promise<void> {
  // No explicit close needed for bun:sqlite in this usage
  console.log('closeDB called, but no explicit close needed for bun:sqlite.');
}
