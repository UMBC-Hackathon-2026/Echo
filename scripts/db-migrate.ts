/**
 * Apply Drizzle migrations to DATABASE_URL (dev). Loads .env.local; never prints
 * the connection string. Run: npm run db:migrate
 */
import { loadEnvLocal } from "./lib/load-env";
loadEnvLocal();

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("db:migrate FAILED — DATABASE_URL is not set");
    process.exit(1);
  }
  const ssl = /sslmode=(require|verify)/.test(url) ? { rejectUnauthorized: true } : undefined;
  const pool = new Pool({ connectionString: url, max: 2, ssl });
  const db = drizzle(pool);
  try {
    await migrate(db, { migrationsFolder: "./lib/db/migrations" });
    console.log("db:migrate OK — migrations applied to DATABASE_URL");
  } catch (e) {
    console.error(`db:migrate FAILED — ${(e as { code?: string; message?: string }).code ?? (e as Error).message}`);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

void main();
