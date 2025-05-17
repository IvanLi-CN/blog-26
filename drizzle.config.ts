import path from 'node:path';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/schema.ts',
  out: './drizzle', // Directory for migration files
  dialect: 'sqlite', // Specify the database driver for Bun's built-in SQLite
  dbCredentials: {
    url: path.resolve(process.cwd() || '', process.env.DB_PATH || './sqlite.db'), // Path to your SQLite database file
  },
});
