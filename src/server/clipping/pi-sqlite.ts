import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  SqliteDatabase,
  SqliteExecutor,
  SqliteValue,
} from "@earendil-works/pi-durable/storage/sqlite";

type Lease = { owner: string; epoch: number; expires: number };

export class RuntimeOwnershipError extends Error {
  constructor() {
    super("Clipping runtime storage is owned by another process or its lease has expired");
    this.name = "RuntimeOwnershipError";
  }
}

/** Serialized, fenced adapter for Pi's portable SQLite storage. */
export class PiSqliteDatabase implements SqliteDatabase {
  private tail: Promise<unknown> = Promise.resolve();
  private closed = false;
  private timer: ReturnType<typeof setInterval>;
  private readonly owner = randomUUID();
  private readonly epoch: number;

  private constructor(
    private readonly database: Database,
    private readonly now: () => number,
    private readonly leaseMs: number,
    heartbeatMs: number,
    private readonly onOwnershipLost?: () => void
  ) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(
        "CREATE TABLE IF NOT EXISTS clipping_runtime_owner (singleton INTEGER PRIMARY KEY CHECK(singleton=1), owner TEXT NOT NULL, epoch INTEGER NOT NULL, expires INTEGER NOT NULL) STRICT"
      );
      const lease = this.readLease();
      if (lease && lease.expires > now()) throw new RuntimeOwnershipError();
      this.epoch = (lease?.epoch ?? 0) + 1;
      database
        .query(
          "INSERT INTO clipping_runtime_owner VALUES (1, ?, ?, ?) ON CONFLICT(singleton) DO UPDATE SET owner=excluded.owner, epoch=excluded.epoch, expires=excluded.expires"
        )
        .run(this.owner, this.epoch, now() + leaseMs);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    this.timer = setInterval(() => {
      void this.transaction(async (tx) => {
        await tx.run(
          "UPDATE clipping_runtime_owner SET expires=? WHERE singleton=1 AND owner=? AND epoch=?",
          now() + leaseMs,
          this.owner,
          this.epoch
        );
      }).catch((error) => {
        clearInterval(this.timer);
        if (error instanceof RuntimeOwnershipError) this.onOwnershipLost?.();
      });
    }, heartbeatMs);
    this.timer.unref();
  }

  static async open(
    path: string,
    options: {
      now?: () => number;
      leaseMs?: number;
      heartbeatMs?: number;
      onOwnershipLost?: () => void;
    } = {}
  ) {
    if (path !== ":memory:") await mkdir(dirname(path), { recursive: true });
    const database = new Database(path, { create: true, strict: true });
    try {
      database.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL");
      return new PiSqliteDatabase(
        database,
        options.now ?? Date.now,
        options.leaseMs ?? 30_000,
        options.heartbeatMs ?? 10_000,
        options.onOwnershipLost
      );
    } catch (error) {
      database.close();
      throw error;
    }
  }

  private readLease() {
    return this.database.query<Lease, []>("SELECT * FROM clipping_runtime_owner").get();
  }

  private assertOwner() {
    if (this.closed) throw new Error("SQLite database is closed");
    const lease = this.readLease();
    if (
      !lease ||
      lease.owner !== this.owner ||
      lease.epoch !== this.epoch ||
      lease.expires <= this.now()
    ) {
      throw new RuntimeOwnershipError();
    }
  }

  /** Synchronous check for application artifact publication inside a fenced transaction. */
  assertOwnership() {
    this.assertOwner();
  }

  private queue<T>(operation: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  transaction<T>(callback: (transaction: SqliteExecutor) => Promise<T>): Promise<T> {
    return this.queue(async () => {
      if (this.closed) throw new Error("SQLite database is closed");
      this.database.exec("BEGIN IMMEDIATE");
      let active = true;
      const check = () => {
        if (!active) throw new Error("SQLite transaction handle is no longer active");
        this.assertOwner();
      };
      const transaction: SqliteExecutor = {
        exec: async (sql) => {
          check();
          this.database.exec(sql);
        },
        run: async (sql, ...params) => {
          check();
          this.database.query(sql).run(...params);
        },
        get: async <R extends object>(sql: string, ...params: SqliteValue[]) => {
          check();
          return this.database.query<R, SqliteValue[]>(sql).get(...params) ?? undefined;
        },
        all: async <R extends object>(sql: string, ...params: SqliteValue[]) => {
          check();
          return this.database.query<R, SqliteValue[]>(sql).all(...params);
        },
      };
      try {
        check();
        const result = await callback(transaction);
        check();
        active = false;
        this.database.exec("COMMIT");
        return result;
      } catch (error) {
        active = false;
        try {
          this.database.exec("ROLLBACK");
        } catch (rollbackError) {
          throw new AggregateError([error, rollbackError], "SQLite rollback failed");
        }
        throw error;
      }
    });
  }

  exec(sql: string) {
    return this.transaction((tx) => tx.exec(sql));
  }

  run(sql: string, ...params: SqliteValue[]) {
    return this.transaction((tx) => tx.run(sql, ...params));
  }

  get<T extends object>(sql: string, ...params: SqliteValue[]) {
    return this.transaction((tx) => tx.get<T>(sql, ...params));
  }

  all<T extends object>(sql: string, ...params: SqliteValue[]) {
    return this.transaction((tx) => tx.all<T>(sql, ...params));
  }

  close() {
    clearInterval(this.timer);
    return this.queue(() => {
      if (this.closed) return;
      this.database
        .query("UPDATE clipping_runtime_owner SET expires=0 WHERE owner=? AND epoch=?")
        .run(this.owner, this.epoch);
      this.closed = true;
      this.database.close();
    });
  }
}
