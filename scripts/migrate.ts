#!/usr/bin/env bun

/**
 * 数据库迁移脚本
 * 运行 Drizzle ORM 数据库迁移
 */

import { Database } from "bun:sqlite";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

const DB_PATH_RELATIVE = process.env.DB_PATH || "./sqlite.db";
const DB_PATH_ABSOLUTE = path.resolve(process.cwd(), DB_PATH_RELATIVE);
const MIGRATIONS_FOLDER_RELATIVE = "./drizzle";
const MIGRATIONS_FOLDER_ABSOLUTE = path.resolve(process.cwd(), MIGRATIONS_FOLDER_RELATIVE);

async function runMigrations() {
  try {
    console.log("🔄 Starting database migration...");
    console.log(`📁 Database path: ${DB_PATH_ABSOLUTE}`);
    console.log(`📂 Migrations folder: ${MIGRATIONS_FOLDER_ABSOLUTE}`);

    // Use Bun's built-in SQLite driver
    const sqlite = new Database(DB_PATH_ABSOLUTE);
    const db = drizzle(sqlite);
    console.log("✅ Database connection successful.");

    console.log("🚀 Running migrations...");
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER_ABSOLUTE });

    console.log("🎉 Migrations finished successfully.");
    sqlite.close();
  } catch (error) {
    console.error("❌ Error running migrations:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  runMigrations();
}
