PRAGMA foreign_keys = ON;

CREATE TABLE durable_schema (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  version INTEGER NOT NULL
);
INSERT INTO durable_schema (singleton, version) VALUES (1, 1);

CREATE TABLE conversations (
  id INTEGER PRIMARY KEY,
  owner_conversation_id INTEGER,
  owner_task_id INTEGER,
  record TEXT NOT NULL CHECK (json_valid(record))
);

CREATE TABLE entries (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL,
  head INTEGER,
  commit_seq INTEGER NOT NULL,
  record TEXT NOT NULL CHECK (json_valid(record))
);

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  abort_requested INTEGER NOT NULL,
  background INTEGER NOT NULL,
  record TEXT NOT NULL CHECK (json_valid(record))
);

CREATE TABLE submissions (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL,
  request_id TEXT,
  status TEXT NOT NULL,
  record TEXT NOT NULL CHECK (json_valid(record))
);

CREATE TABLE documents (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  family INTEGER NOT NULL,
  key_value TEXT NOT NULL,
  scope_kind TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  retired_at INTEGER,
  record TEXT NOT NULL CHECK (json_valid(record))
);

CREATE TABLE document_revisions (
  document_id INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL,
  version INTEGER NOT NULL,
  content TEXT NOT NULL CHECK (json_valid(content)),
  PRIMARY KEY (document_id, seq)
);

CREATE TABLE record_ids (id INTEGER PRIMARY KEY, record_type TEXT NOT NULL);
CREATE TABLE clipping_runtime_owner (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  owner TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
INSERT INTO clipping_runtime_owner (singleton, owner, epoch, expires)
VALUES (1, 'test-owner', 1, 1);

INSERT INTO conversations (id, record, owner_conversation_id, owner_task_id)
VALUES
  (1, '{"id":1,"ownership":{"kind":"ownerless"}}', NULL, NULL),
  (2, '{"id":2,"ownership":{"kind":"ownerless"}}', NULL, NULL);

INSERT INTO entries (id, conversation_id, head, commit_seq, record)
VALUES
  (11, 1, NULL, 1, '{"id":11,"conversationId":1,"kind":"pi.user","model":[{"role":"user","content":"What is current?","timestamp":1000}]}'),
  (12, 1, NULL, 2, '{"id":12,"conversationId":1,"kind":"pi.assistant","model":[{"role":"assistant","content":[{"type":"text","text":"The current answer."}],"timestamp":2000,"stopReason":"stop"}]}'),
  (13, 1, NULL, 3, '{"id":13,"conversationId":1,"kind":"pi.system","model":[{"role":"system","content":"Article context","timestamp":2500}]}'),
  (21, 2, NULL, 4, '{"id":21,"conversationId":2,"kind":"pi.user","model":[{"role":"user","content":"Legacy target question","timestamp":1100}]}'),
  (22, 2, NULL, 5, '{"id":22,"conversationId":2,"kind":"pi.assistant","model":[{"role":"assistant","content":"Legacy target answer","timestamp":2100,"stopReason":"stop"}]}');

INSERT INTO documents (id, kind, family, key_value, scope_kind, owner_id, created_at, retired_at, record)
VALUES (
  81, 'pi.live', 0, '', 'conversation', 1, 6, NULL,
  '{"id":81,"kind":"pi.live","scope":{"kind":"conversation","conversationId":1},"history":"latest","fork":"initial"}'
);
INSERT INTO document_revisions (document_id, seq, kind, version, content)
VALUES (
  81, 6, 'base', 1,
  '{"generation":{"attempt":1,"message":{"role":"assistant","content":[{"type":"text","text":"Partial answer"}],"timestamp":3000}}}'
);
