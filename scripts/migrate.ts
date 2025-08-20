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

/**
 * 验证关键表是否存在，如果不存在则创建
 */
async function verifyCriticalTables(sqlite: any): Promise<void> {
  const criticalTables = [
    {
      name: "content_sync_logs",
      sql: `
        CREATE TABLE IF NOT EXISTS content_sync_logs (
          id text PRIMARY KEY NOT NULL,
          source_type text NOT NULL,
          source_name text NOT NULL,
          operation text NOT NULL,
          status text NOT NULL,
          message text NOT NULL,
          file_path text,
          data text,
          created_at integer NOT NULL
        )
      `,
    },
    {
      name: "content_sync_status",
      sql: `
        CREATE TABLE IF NOT EXISTS content_sync_status (
          source_type text PRIMARY KEY NOT NULL,
          source_name text NOT NULL,
          last_sync_at integer,
          status text DEFAULT 'idle' NOT NULL,
          progress integer DEFAULT 0 NOT NULL,
          current_step text,
          total_items integer DEFAULT 0 NOT NULL,
          processed_items integer DEFAULT 0 NOT NULL,
          error_message text,
          metadata text,
          updated_at integer NOT NULL
        )
      `,
    },
  ];

  for (const table of criticalTables) {
    try {
      // 检查表是否存在
      const result = sqlite
        .query("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(table.name);

      if (!result) {
        console.log(`  📝 Creating missing table: ${table.name}`);
        sqlite.exec(table.sql);
        console.log(`  ✅ Table ${table.name} created successfully`);
      } else {
        console.log(`  ✅ Table ${table.name} exists`);
      }
    } catch (error) {
      console.error(`  ❌ Error verifying table ${table.name}:`, error);
      throw error;
    }
  }
}

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

    console.log("🔍 Verifying critical tables...");
    await verifyCriticalTables(sqlite);

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
