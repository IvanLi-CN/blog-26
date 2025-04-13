import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../db/schema.ts";
import { config } from "./config.ts";

await mkdir(dirname(config.DB_PATH), { recursive: true });
export const connection = new Database(config.DB_PATH, { create: true });
export const db = drizzle(connection, { schema });
