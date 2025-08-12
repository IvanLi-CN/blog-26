import { Database } from "bun:sqlite";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

const DB_PATH = process.env.DB_PATH || "./sqlite.db";
const resolvedDBPath = path.resolve(process.cwd(), DB_PATH);

export let db: ReturnType<typeof drizzle<typeof schema>>;

export async function initializeDB(): Promise<void> {
  if (db) return; // Already initialized

  try {
    // Use Bun's built-in SQLite driver
    const sqlite = new Database(resolvedDBPath);
    db = drizzle(sqlite, { schema });
    console.log("Connected to the SQLite database at", resolvedDBPath);
    console.log("Drizzle ORM initialized.");
  } catch (err) {
    console.error("Error initializing database with Drizzle", (err as Error).message);
    throw err;
  }
}

export type DB = typeof db;
