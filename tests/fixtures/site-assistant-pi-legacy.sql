PRAGMA foreign_keys = ON;

CREATE TABLE conversations (
  id INTEGER PRIMARY KEY,
  record TEXT NOT NULL CHECK (json_valid(record))
);

CREATE TABLE entries (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL,
  record TEXT NOT NULL CHECK (json_valid(record))
);

INSERT INTO conversations (id, record)
VALUES (7, '{"id":7,"legacy":true}');

INSERT INTO entries (id, conversation_id, record)
VALUES
  (71, 7, '{"id":71,"conversationId":7,"kind":"pi.user","model":[{"role":"user","content":"Legacy schema question","timestamp":1000}]}'),
  (72, 7, '{"id":72,"conversationId":7,"kind":"pi.assistant","model":[{"role":"assistant","content":"Legacy schema answer","timestamp":2000,"stopReason":"stop"}]}');
