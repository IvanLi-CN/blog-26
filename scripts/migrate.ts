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

    // List all tables for debugging (optional)
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
