import pkg from 'sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../sqlite.db'); // Store sqlite.db in apps/llamaindex-demo/

export interface DBRecord {
  filepath: string;
  content_hash: string;
  last_modified_time: number;
  indexed_at: number;
  vector?: Buffer; // Add vector field, using Buffer for BLOB
}

let db: pkg.Database;

export async function initializeDB(): Promise<void> {
  return new Promise((resolve, reject) => {
    db = new pkg.Database(DB_PATH, (err: Error | null) => {
      if (err) {
        console.error('Error opening database', err.message);
        return reject(err);
      }
      console.log('Connected to the SQLite database.');
      db.run(`
        CREATE TABLE IF NOT EXISTS vectorized_files (
          filepath TEXT PRIMARY KEY,
          content_hash TEXT NOT NULL,
          last_modified_time INTEGER NOT NULL,
          indexed_at INTEGER NOT NULL
        )
      `, (err: Error | null) => {
        if (err) {
          console.error('Error creating table', err.message);
          return reject(err);
        }
        console.log('Table "vectorized_files" is ready.');
        resolve();
      });
    });
  });
}

export async function getFileRecord(filepath: string): Promise<DBRecord | null> {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error("Database not initialized. Call initializeDB() first."));
    }
    db.get("SELECT * FROM vectorized_files WHERE filepath = ?", [filepath], (err: Error | null, row: DBRecord) => {
      if (err) {
        return reject(err);
      }
      resolve(row || null);
    });
  });
}

export async function upsertFileRecord(record: DBRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error("Database not initialized. Call initializeDB() first."));
    }
    const { filepath, content_hash, last_modified_time, indexed_at, vector } = record;
    db.run(
      `INSERT INTO vectorized_files (filepath, content_hash, last_modified_time, indexed_at, vector)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(filepath) DO UPDATE SET
         content_hash = excluded.content_hash,
         last_modified_time = excluded.last_modified_time,
         indexed_at = excluded.indexed_at,
         vector = excluded.vector
      `,
      [filepath, content_hash, last_modified_time, indexed_at, vector],
      function (err: Error | null) {
        if (err) {
          return reject(err);
        }
        resolve();
      }
    );
  });
}

export async function deleteFileRecord(filepath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error("Database not initialized. Call initializeDB() first."));
    }
    db.run("DELETE FROM vectorized_files WHERE filepath = ?", [filepath], function (err: Error | null) {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}

export async function getAllFileRecords(): Promise<DBRecord[]> {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error("Database not initialized. Call initializeDB() first."));
    }
    db.all("SELECT * FROM vectorized_files", [], (err: Error | null, rows: DBRecord[]) => {
      if (err) {
        return reject(err);
      }
      resolve(rows);
    });
  });
}

// Helper function to calculate cosine similarity between two vectors (Buffers)
function cosineSimilarity(vec1: Buffer, vec2: Buffer): number {
  if (vec1.length !== vec2.length) {
    throw new Error("Vectors must have the same dimension for cosine similarity.");
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

export async function findSimilarFiles(queryVector: Buffer, limit: number = 5): Promise<(DBRecord & { score: number })[]> {
  return new Promise(async (resolve, reject) => {
    if (!db) {
      return reject(new Error("Database not initialized. Call initializeDB() first."));
    }

    // Fetch all records with vectors
    db.all("SELECT * FROM vectorized_files WHERE vector IS NOT NULL", [], (err: Error | null, rows: DBRecord[]) => {
      if (err) {
        return reject(err);
      }

      // Calculate similarity and sort
      const results = rows
        .map(row => {
          // Ensure row.vector is a Buffer before calculating similarity
          if (row.vector instanceof Buffer) {
             const score = cosineSimilarity(queryVector, row.vector);
             return { ...row, score };
          }
          return null; // Skip records without a vector
        })
        .filter(row => row !== null) as (DBRecord & { score: number })[]; // Filter out nulls and assert type

      results.sort((a, b) => b.score - a.score); // Sort by score descending

      resolve(results.slice(0, limit)); // Return top N results
    });
  });
}


// Optional: Close the database connection when the application exits
// This might be more relevant for long-running services.
// For a script, it might not be strictly necessary if the process exits cleanly.
export async function closeDB(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err: Error | null) => {
        if (err) {
          console.error('Error closing database', err.message);
          return reject(err);
        }
        console.log('Closed the SQLite database connection.');
        resolve();
      });
    } else {
      resolve(); // No db instance to close
    }
  });
}