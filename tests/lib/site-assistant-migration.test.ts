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

  it("keeps generation message references nullable when messages are deleted", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec("PRAGMA foreign_keys = ON");
    sqlite.exec(fs.readFileSync(fixturePath, "utf8"));
    for (const statement of fs
      .readFileSync(migrationPath, "utf8")
      .split("--> statement-breakpoint")
      .map((part) => part.trim())
      .filter(Boolean)) {
      sqlite.exec(statement);
    }

    const foreignKeys = sqlite
      .query("pragma foreign_key_list('assistant_generation_jobs')")
      .all() as Array<{ from: string; on_delete: string }>;
    expect(
      foreignKeys
        .filter(({ from }) => from === "user_message_id" || from === "assistant_message_id")
        .map(({ from, on_delete }) => [from, on_delete.toLowerCase()])
    ).toEqual(
      expect.arrayContaining([
        ["user_message_id", "set null"],
        ["assistant_message_id", "set null"],
      ])
    );

    sqlite
      .query(
        "insert into frontend_users (id, is_admin, display_name, avatar_url, created_at, updated_at) values (?, ?, ?, ?, ?, ?)"
      )
      .run("migration-delete-owner", 0, "Migration Owner", "/avatar.svg", 1, 1);
    sqlite
      .query(
        "insert into assistant_conversations (id, frontend_user_id, kind, status, created_at) values (?, ?, ?, ?, ?)"
      )
      .run("migration-delete-conversation", "migration-delete-owner", "general", "active", 2);
    sqlite
      .query(
        "insert into assistant_messages (id, conversation_id, sequence, role, content, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        "migration-delete-user-message",
        "migration-delete-conversation",
        1,
        "user",
        "Question",
        "completed",
        3,
        3
      );
    sqlite
      .query(
        "insert into assistant_messages (id, conversation_id, sequence, role, content, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        "migration-delete-assistant-message",
        "migration-delete-conversation",
        2,
        "assistant",
        "Answer",
        "completed",
        4,
        4
      );
    sqlite
      .query(
        "insert into assistant_generation_jobs (id, conversation_id, user_message_id, assistant_message_id, request_id, status, attempt, cancel_requested, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        "migration-delete-job",
        "migration-delete-conversation",
        "migration-delete-user-message",
        "migration-delete-assistant-message",
        "migration-delete-request",
        "queued",
        1,
        0,
        5,
        5
      );

    sqlite
      .query("delete from assistant_messages where id = ?")
      .run("migration-delete-user-message");
    expect(
      sqlite
        .query(
          "select user_message_id, assistant_message_id from assistant_generation_jobs where id = ?"
        )
        .get("migration-delete-job")
    ).toEqual({
      user_message_id: null,
      assistant_message_id: "migration-delete-assistant-message",
    });

    sqlite
      .query("delete from assistant_messages where id = ?")
      .run("migration-delete-assistant-message");
    expect(
      sqlite
        .query(
          "select user_message_id, assistant_message_id from assistant_generation_jobs where id = ?"
        )
        .get("migration-delete-job")
    ).toEqual({ user_message_id: null, assistant_message_id: null });
    sqlite.close();
  });
});
