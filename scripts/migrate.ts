import { Database } from 'bun:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH_RELATIVE = '../sqlite.db';
const DB_PATH_ABSOLUTE = path.resolve(__dirname, DB_PATH_RELATIVE);
const MIGRATIONS_FOLDER_RELATIVE = '../drizzle';
const MIGRATIONS_FOLDER_ABSOLUTE = path.resolve(__dirname, MIGRATIONS_FOLDER_RELATIVE);

async function runMigrations() {
  try {
    console.log(`Attempting to connect to database at: ${DB_PATH_ABSOLUTE}`);
    const sqlite = new Database(DB_PATH_ABSOLUTE);
    const db = drizzle(sqlite);
    console.log('Database connection successful.');

    console.log(`Running migrations from folder: ${MIGRATIONS_FOLDER_ABSOLUTE}`);
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER_ABSOLUTE });

    console.log('Migrations finished successfully.');
  } catch (error) {
    console.error('Error running migrations:', error);
    process.exit(1);
  }
}

runMigrations();
