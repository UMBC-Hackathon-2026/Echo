/**
 * Delete expired debug LLM payloads. Run on a schedule when DEBUG_LLM_PAYLOADS
 * is used. Loads .env.local; prints only a count.
 */
import { loadEnvLocal } from "./lib/load-env";
loadEnvLocal();
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("cleanup-debug: DATABASE_URL not set");
    process.exit(1);
  }
  const ssl = /sslmode=(require|verify)/.test(url) ? { rejectUnauthorized: true } : undefined;
  const pool = new Pool({ connectionString: url, max: 1, ssl });
  try {
    const res = await pool.query("DELETE FROM debug_llm_payloads WHERE expires_at < now()");
    console.log(`cleanup-debug OK — removed ${res.rowCount ?? 0} expired payload(s)`);
  } finally {
    await pool.end().catch(() => {});
  }
}

void main();
