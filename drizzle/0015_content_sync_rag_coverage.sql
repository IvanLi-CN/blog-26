CREATE TABLE content_tasks (
 id text PRIMARY KEY NOT NULL, kind text NOT NULL, source text NOT NULL,
 request_key text NOT NULL, origin text NOT NULL, target text NOT NULL, result text,
 status text NOT NULL, phase text NOT NULL, total integer NOT NULL DEFAULT 0,
 processed integer NOT NULL DEFAULT 0, failed integer NOT NULL DEFAULT 0,
 error text, started_at integer NOT NULL, finished_at integer, cancel_requested integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX content_tasks_source_time ON content_tasks(source, started_at);
--> statement-breakpoint
CREATE UNIQUE INDEX content_tasks_active_source ON content_tasks(kind, source) WHERE status IN ('queued','running');
--> statement-breakpoint
CREATE TABLE content_task_counters (source text PRIMARY KEY NOT NULL, total integer NOT NULL DEFAULT 0, tracking_since integer NOT NULL);
--> statement-breakpoint
CREATE TABLE rag_index_manifests (id text PRIMARY KEY NOT NULL, source text NOT NULL, identity text NOT NULL, targets text NOT NULL, created_at integer NOT NULL);
--> statement-breakpoint
CREATE TABLE rag_index_targets (id text PRIMARY KEY NOT NULL, source text NOT NULL, parent_id text NOT NULL, status text NOT NULL, task_id text, vector_id text, vector_digest text, dim integer, error text, updated_at integer NOT NULL);
--> statement-breakpoint
CREATE INDEX rag_index_targets_parent ON rag_index_targets(source,parent_id);

--> statement-breakpoint
CREATE TABLE rag_index_configs (fingerprint text PRIMARY KEY NOT NULL,dim integer NOT NULL,updated_at integer NOT NULL);
