CREATE TABLE search_outbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete'))
);
--> statement-breakpoint
CREATE TABLE search_content_versions (
  content_id TEXT PRIMARY KEY NOT NULL,
  version INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE search_index_state (
  id TEXT PRIMARY KEY NOT NULL,
  generation TEXT NOT NULL,
  checkpoint INTEGER NOT NULL,
  schema_version TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE search_settings (
  id TEXT PRIMARY KEY NOT NULL,
  config TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER search_content_insert AFTER INSERT ON posts BEGIN
  INSERT INTO search_outbox(content_id, operation) VALUES (NEW.id, 'upsert');
  INSERT INTO search_content_versions(content_id,version) VALUES (NEW.id,(SELECT MAX(seq) FROM search_outbox))
    ON CONFLICT(content_id) DO UPDATE SET version=excluded.version;
END;
--> statement-breakpoint
CREATE TRIGGER search_content_update AFTER UPDATE ON posts BEGIN
  INSERT INTO search_outbox(content_id, operation) VALUES (NEW.id, 'upsert');
  INSERT INTO search_content_versions(content_id,version) VALUES (NEW.id,(SELECT MAX(seq) FROM search_outbox))
    ON CONFLICT(content_id) DO UPDATE SET version=excluded.version;
  INSERT INTO search_outbox(content_id, operation) SELECT OLD.id, 'delete' WHERE OLD.id <> NEW.id;
  DELETE FROM search_content_versions WHERE content_id = OLD.id AND OLD.id <> NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER search_content_delete AFTER DELETE ON posts BEGIN
  INSERT INTO search_outbox(content_id, operation) VALUES (OLD.id, 'delete');
  DELETE FROM search_content_versions WHERE content_id = OLD.id;
END;

--> statement-breakpoint
CREATE TRIGGER search_clipping_insert AFTER INSERT ON memo_clippings BEGIN
  INSERT INTO search_outbox(content_id, operation) VALUES (NEW.memo_id, 'upsert');
  INSERT INTO search_content_versions(content_id,version) VALUES (NEW.memo_id,(SELECT MAX(seq) FROM search_outbox))
    ON CONFLICT(content_id) DO UPDATE SET version=excluded.version;
END;
--> statement-breakpoint
CREATE TRIGGER search_clipping_update AFTER UPDATE ON memo_clippings BEGIN
  INSERT INTO search_outbox(content_id, operation) VALUES (NEW.memo_id, 'upsert');
  INSERT INTO search_content_versions(content_id,version) VALUES (NEW.memo_id,(SELECT MAX(seq) FROM search_outbox))
    ON CONFLICT(content_id) DO UPDATE SET version=excluded.version;
  INSERT INTO search_outbox(content_id, operation) SELECT OLD.memo_id, 'upsert' WHERE OLD.memo_id <> NEW.memo_id;
  INSERT INTO search_content_versions(content_id,version) SELECT OLD.memo_id,(SELECT MAX(seq) FROM search_outbox) WHERE OLD.memo_id <> NEW.memo_id
    ON CONFLICT(content_id) DO UPDATE SET version=excluded.version;
END;
--> statement-breakpoint
CREATE TRIGGER search_clipping_delete AFTER DELETE ON memo_clippings BEGIN
  INSERT INTO search_outbox(content_id, operation) VALUES (OLD.memo_id, 'upsert');
  INSERT INTO search_content_versions(content_id,version) VALUES (OLD.memo_id,(SELECT MAX(seq) FROM search_outbox))
    ON CONFLICT(content_id) DO UPDATE SET version=excluded.version;
END;
