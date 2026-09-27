/** Read migration state from DATABASE_URL without applying or changing anything. */
import { loadEnvLocal } from "./lib/load-env";
loadEnvLocal();

import { Pool } from "pg";
import journal from "@/lib/db/migrations/meta/_journal.json";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const ssl = /sslmode=(require|verify)/.test(url) ? { rejectUnauthorized: true } : undefined;
  const pool = new Pool({ connectionString: url, max: 1, ssl });
  try {
    const result = await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations");
    const applied = result.rows[0]?.count ?? 0;
    const expected = journal.entries.length;
    if (applied !== expected) throw new Error(`migration count mismatch (applied ${applied}, expected ${expected})`);
    console.log(`db:status OK — ${applied}/${expected} migrations applied`);
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(`db:status FAILED — ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
