#!/usr/bin/env bun

/**
 * 迁移 memos 表以兼容 ContentItem 接口
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

const DB_PATH = process.env.DB_PATH || "./sqlite.db";

async function migrateMemos() {
  console.log("🔄 开始迁移 memos 表...");
  console.log(`📁 数据库路径: ${DB_PATH}`);

  const sqlite = new Database(DB_PATH);
  const _db = drizzle(sqlite);

  try {
    // 检查表是否存在
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memos'")
      .all();
    if (tables.length === 0) {
      console.log("❌ memos 表不存在");
      return;
    }

    console.log("📋 检查现有表结构...");
    const columns = sqlite.prepare("PRAGMA table_info(memos)").all();
    const existingColumns = columns.map((col: any) => col.name);
    console.log("现有字段:", existingColumns);

    // 需要添加的新字段
    const newColumns = [
      { name: "type", sql: 'ALTER TABLE memos ADD COLUMN type TEXT DEFAULT "memo"' },
      { name: "slug", sql: "ALTER TABLE memos ADD COLUMN slug TEXT" },
      { name: "title", sql: "ALTER TABLE memos ADD COLUMN title TEXT" },
      { name: "excerpt", sql: "ALTER TABLE memos ADD COLUMN excerpt TEXT" },
      { name: "last_modified", sql: "ALTER TABLE memos ADD COLUMN last_modified INTEGER" },
      { name: "source", sql: "ALTER TABLE memos ADD COLUMN source TEXT" },
      { name: "file_path", sql: "ALTER TABLE memos ADD COLUMN file_path TEXT" },
      { name: "draft", sql: "ALTER TABLE memos ADD COLUMN draft INTEGER DEFAULT 0" },
      { name: "public", sql: "ALTER TABLE memos ADD COLUMN public INTEGER DEFAULT 1" },
      { name: "publish_date", sql: "ALTER TABLE memos ADD COLUMN publish_date INTEGER" },
      { name: "update_date", sql: "ALTER TABLE memos ADD COLUMN update_date INTEGER" },
      { name: "category", sql: "ALTER TABLE memos ADD COLUMN category TEXT" },
      { name: "author", sql: "ALTER TABLE memos ADD COLUMN author TEXT" },
      { name: "image", sql: "ALTER TABLE memos ADD COLUMN image TEXT" },
      { name: "metadata", sql: "ALTER TABLE memos ADD COLUMN metadata TEXT" },
    ];

    // 添加缺失的字段
    for (const column of newColumns) {
      if (!existingColumns.includes(column.name)) {
        console.log(`➕ 添加字段: ${column.name}`);
        sqlite.exec(column.sql);
      } else {
        console.log(`✅ 字段已存在: ${column.name}`);
      }
    }

    // 创建索引
    console.log("📊 创建索引...");
    const indexes = [
      "CREATE INDEX IF NOT EXISTS idx_memos_slug ON memos(slug)",
      "CREATE INDEX IF NOT EXISTS idx_memos_type ON memos(type)",
      "CREATE INDEX IF NOT EXISTS idx_memos_source ON memos(source)",
      "CREATE INDEX IF NOT EXISTS idx_memos_public ON memos(public)",
      "CREATE INDEX IF NOT EXISTS idx_memos_publish_date ON memos(publish_date)",
      "CREATE INDEX IF NOT EXISTS idx_memos_last_modified ON memos(last_modified)",
    ];

    for (const indexSql of indexes) {
      sqlite.exec(indexSql);
    }

    // 更新现有记录
    console.log("🔄 更新现有记录...");
    const updateSql = `
      UPDATE memos SET 
        type = 'memo',
        slug = COALESCE(slug, REPLACE(REPLACE(id, '/', '-'), '.md', '')),
        source = COALESCE(data_source, 'webdav'),
        file_path = COALESCE(source_path, id),
        draft = 0,
        public = COALESCE(is_public, 1),
        publish_date = COALESCE(created_at, strftime('%s', 'now')),
        update_date = updated_at,
        last_modified = COALESCE(updated_at, created_at, strftime('%s', 'now')),
        metadata = '{}'
      WHERE type IS NULL OR slug IS NULL OR source IS NULL OR file_path IS NULL OR publish_date IS NULL
    `;

    const _result = sqlite.exec(updateSql);
    console.log("✅ 记录更新完成");

    // 确保关键字段不为空
    sqlite.exec(
      `UPDATE memos SET slug = REPLACE(REPLACE(id, '/', '-'), '.md', '') WHERE slug IS NULL OR slug = ''`
    );
    sqlite.exec(`UPDATE memos SET source = 'webdav' WHERE source IS NULL OR source = ''`);
    sqlite.exec(`UPDATE memos SET file_path = id WHERE file_path IS NULL OR file_path = ''`);
    sqlite.exec(`UPDATE memos SET publish_date = created_at WHERE publish_date IS NULL`);
    sqlite.exec(
      `UPDATE memos SET last_modified = COALESCE(updated_at, created_at) WHERE last_modified IS NULL`
    );

    console.log("🎉 memos 表迁移完成！");

    // 显示最终表结构
    const finalColumns = sqlite.prepare("PRAGMA table_info(memos)").all();
    console.log("最终表结构:");
    finalColumns.forEach((col: any) => {
      console.log(
        `  - ${col.name}: ${col.type} ${col.notnull ? "NOT NULL" : ""} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ""}`
      );
    });
  } catch (error) {
    console.error("❌ 迁移失败:", error);
    throw error;
  } finally {
    sqlite.close();
  }
}

// 运行迁移
migrateMemos().catch((error) => {
  console.error("迁移过程中发生错误:", error);
  process.exit(1);
});
