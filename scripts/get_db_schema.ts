import { Database } from 'bun:sqlite';
import path from 'node:path';

const DB_PATH_RELATIVE = process.env.DB_PATH || './sqlite.db';
const DB_PATH_ABSOLUTE = path.resolve(process.cwd(), DB_PATH_RELATIVE);

try {
  console.log(`Connecting to database at: ${DB_PATH_ABSOLUTE}`);
  const sqlite = new Database(DB_PATH_ABSOLUTE, { readonly: true });

  const tables = sqlite
    .query(
      "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle_%'"
    )
    .all() as { name: string; sql: string }[];

  console.log('Database schema verification:');

  if (tables.length === 0) {
    console.log('No user-defined tables found.');
  } else {
    for (const table of tables) {
      console.log(`\n--- Schema for table: ${table.name} ---`);
      console.log(table.sql);
      console.log('--- End schema ---');
    }
  }

  sqlite.close();
} catch (error) {
  console.error('Failed to verify database schema:', error);
  process.exit(1);
}
