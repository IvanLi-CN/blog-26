import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const fixturePath = path.resolve("tests/fixtures/site-assistant-legacy.sql");
const migrationPath = path.resolve("drizzle/0021_site_knowledge_assistant_contracts.sql");

describe("site assistant migration compatibility", () => {
  it("upgrades a legacy comment database without rewriting its author", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(fs.readFileSync(fixturePath, "utf8"));
    for (const statement of fs
      .readFileSync(migrationPath, "utf8")
      .split("--> statement-breakpoint")
      .map((part) => part.trim())
      .filter(Boolean)) {
      sqlite.exec(statement);
    }

    const columns = sqlite.query("pragma table_info(comments)").all() as Array<{ name: string }>;
    const comment = sqlite
      .query("select reader_id, frontend_user_id, content from comments where id = ?")
      .get("legacy-comment") as {
      reader_id: string;
      frontend_user_id: string | null;
      content: string;
    };
    expect(columns.some((column) => column.name === "frontend_user_id")).toBe(true);
    expect(comment).toEqual({
      reader_id: "legacy-reader",
      frontend_user_id: null,
      content: "Keep this comment",
    });
    expect(
      sqlite
        .query("select name from sqlite_master where type = 'table' and name = ?")
        .get("assistant_migration_state")
    ).toBeTruthy();
    sqlite.close();
  });
});
