import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

export let db: ReturnType<typeof drizzle<typeof schema>>;

const DB_PATH = process.env.DB_PATH || "./sqlite.db";
let resolvedDBPath = path.resolve(process.cwd(), DB_PATH);

export async function initializeDB(force: boolean = false): Promise<void> {
  // 重新计算数据库路径，以防环境变量已更改
  const currentDBPath = process.env.DB_PATH || "./sqlite.db";
  const currentResolvedDBPath = path.resolve(process.cwd(), currentDBPath);

  // 如果强制重新初始化，或者数据库未初始化，或者路径已更改
  if (force || !db || resolvedDBPath !== currentResolvedDBPath) {
    try {
      // Ensure parent directory exists when DB path includes subdirectories
      const dbDir = path.dirname(currentResolvedDBPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Use Bun's built-in SQLite driver
      const sqlite = new Database(currentResolvedDBPath);
      db = drizzle(sqlite, { schema });
      console.log("Connected to the SQLite database at", currentResolvedDBPath);
      console.log("Drizzle ORM initialized.");

      // 更新全局路径变量
      (global as Record<string, unknown>).resolvedDBPath = currentResolvedDBPath;
      resolvedDBPath = currentResolvedDBPath;
    } catch (err) {
      console.error("Error initializing database with Drizzle", (err as Error).message);
      throw err;
    }
  }
}

export type DB = typeof db;
