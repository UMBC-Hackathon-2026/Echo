import "server-only";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

/**
 * Postgres pool + Drizzle client (ARCHITECTURE_REVISED §3, §9). Tiger Cloud has
 * no pooler, so we keep a small direct pool (max 5) with TLS verification on.
 */
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    const ssl = /sslmode=(require|verify)/.test(connectionString) ? { rejectUnauthorized: true } : undefined;
    pool = new Pool({ connectionString, max: 5, ssl });
  }
  return pool;
}

export type Db = NodePgDatabase<typeof schema>;

let db: Db | null = null;
export function getDb(): Db {
  if (!db) db = drizzle(getPool(), { schema });
  return db;
}
