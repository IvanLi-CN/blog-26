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
  let sqlite: any = null;

  try {
    console.log("🔄 Starting database migration...");
    console.log(`📁 Database path: ${DB_PATH_ABSOLUTE}`);
    console.log(`📂 Migrations folder: ${MIGRATIONS_FOLDER_ABSOLUTE}`);

    // Check if migrations folder exists
    const fs = await import("node:fs");
    if (!fs.existsSync(MIGRATIONS_FOLDER_ABSOLUTE)) {
      throw new Error(`Migrations folder does not exist: ${MIGRATIONS_FOLDER_ABSOLUTE}`);
    }

    // Ensure database directory exists (necessary when DB_PATH includes subdirectories)
    const dbDir = path.dirname(DB_PATH_ABSOLUTE);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Use Bun's built-in SQLite driver
    sqlite = new Database(DB_PATH_ABSOLUTE);
    const db = drizzle(sqlite);
    console.log("✅ Database connection successful.");

    // Check database file size before migration
    const statsBefore = fs.statSync(DB_PATH_ABSOLUTE);
    console.log(`📊 Database size before migration: ${statsBefore.size} bytes`);

    console.log("🚀 Running migrations...");
    try {
      migrate(db, { migrationsFolder: MIGRATIONS_FOLDER_ABSOLUTE });
      console.log("✅ Drizzle migrations completed successfully.");
    } catch (migrateError) {
      console.error("❌ Drizzle migration failed:", migrateError);
      throw migrateError;
    }

    // Check database file size after migration
    const statsAfter = fs.statSync(DB_PATH_ABSOLUTE);
    console.log(`📊 Database size after migration: ${statsAfter.size} bytes`);

    console.log("🔍 Verifying critical tables...");
    await verifyCriticalTables(sqlite);

    // List all tables for debugging
    const allTables = sqlite.query("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log(`📋 All tables in database: ${allTables.map((t: any) => t.name).join(", ")}`);

    console.log("🎉 Migrations finished successfully.");
  } catch (error) {
    console.error("❌ Error running migrations:", error);
    console.error(
      "Stack trace:",
      error instanceof Error ? error.stack : "No stack trace available"
    );
    process.exit(1);
  } finally {
    if (sqlite) {
      try {
        sqlite.close();
        console.log("🔒 Database connection closed.");
      } catch (closeError) {
        console.error("⚠️  Warning: Failed to close database connection:", closeError);
      }
    }
  }
}

if (import.meta.main) {
  runMigrations();
}
