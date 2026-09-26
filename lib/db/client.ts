/**
 * PostgreSQL client.
 *
 * STUB: instantiate a real pool (e.g. `pg`) using DATABASE_URL. Kept as a thin
 * accessor so callers depend on `query()` rather than a specific driver.
 */

export interface QueryResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount: number;
}

const DATABASE_URL = process.env.DATABASE_URL;

/**
 * Executes a parameterized SQL query.
 * STUB: replace with a pooled `pg` connection.
 */
export async function query<Row = Record<string, unknown>>(
  _sql: string,
  _params: unknown[] = [],
): Promise<QueryResult<Row>> {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  throw new Error("db.query not implemented");
}
