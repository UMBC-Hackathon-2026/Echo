/**
 * Reset the TEST database and re-apply migrations. Refuses to run unless the
 * target is DATABASE_URL_TEST, and refuses if that URL's host AND database equal
 * DATABASE_URL's. Loads .env.local; never prints connection strings.
 * Run: npm run db:reset:test
 */
import { loadEnvLocal } from "./lib/load-env";
loadEnvLocal();

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

async function main() {
  const testUrl = process.env.DATABASE_URL_TEST;
  const prodUrl = process.env.DATABASE_URL;
  if (!testUrl) {
    console.error("db:reset:test REFUSED — DATABASE_URL_TEST is not set");
    process.exit(1);
  }
  const test = new URL(testUrl);
  if (prodUrl) {
    const prod = new URL(prodUrl);
    if (test.hostname === prod.hostname && test.pathname === prod.pathname) {
      console.error("db:reset:test REFUSED — DATABASE_URL_TEST has the same host and database as DATABASE_URL");
      process.exit(1);
    }
  }

  const ssl = /sslmode=(require|verify)/.test(testUrl) ? { rejectUnauthorized: true } : undefined;
  const pool = new Pool({ connectionString: testUrl, max: 2, ssl });
  const db = drizzle(pool);
  try {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE;");
    await migrate(db, { migrationsFolder: "./lib/db/migrations" });
    console.log("db:reset:test OK — test database reset and migrated");
  } catch (e) {
    console.error(`db:reset:test FAILED — ${(e as { code?: string; message?: string }).code ?? (e as Error).message}`);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

void main();
