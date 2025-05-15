import type { Config } from 'drizzle-kit';

export default {
  schema: './src/lib/schema.ts',
  out: './drizzle', // Directory for migration files
  driver: 'bun-sqlite', // Specify the database driver for Bun's built-in SQLite
  dbCredentials: {
    url: './sqlite.db', // Path to your SQLite database file
  },
} satisfies Config;
