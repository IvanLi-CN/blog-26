import { Hono } from "hono";

import { zValidator } from "@hono/zod-validator";
import type { Serve } from "bun";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { serveStatic } from "hono/bun";
import { streamSSE } from "hono/streaming";
import { filter, takeUntil } from "rxjs";
import { z } from "zod";
import { config } from "./config.ts";
import { db } from "./db.ts";
import { exit$ } from "./shared.ts";

migrate(db, { migrationsFolder: "./drizzle" });

const app = new Hono();


app.get(
  "/*",
  serveStatic({
    root: "../web/dist",
  }),
);
app.get(
  "*",
  serveStatic({
    root: "../web/dist",
    rewriteRequestPath: (path) => {
      return "/index.html";
    },
  }),
);

export default app;
