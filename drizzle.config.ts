import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/schema.ts',
  out: './drizzle', // Directory for migration files
  dialect: 'sqlite', // Specify the database driver for Bun's built-in SQLite
  dbCredentials: {
    url: './sqlite.db', // Path to your SQLite database file
  },
});
