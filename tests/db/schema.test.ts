import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { loadEnvLocal } from "@/scripts/lib/load-env";

// DB tests need DATABASE_URL_TEST (a Tiger Cloud test service, or the CI
// Postgres service container). They skip cleanly when it is absent so `verify`
// still runs without credentials.
loadEnvLocal();
const TEST_URL = process.env.DATABASE_URL_TEST;

describe.skipIf(!TEST_URL)("database schema (information_schema)", () => {
  let pool: Pool;
  beforeAll(() => {
    const ssl = /sslmode=/.test(TEST_URL ?? "") ? { rejectUnauthorized: true } : undefined;
    pool = new Pool({ connectionString: TEST_URL, max: 2, ssl });
  });
  afterAll(async () => {
    await pool?.end().catch(() => {});
  });

  it("has all seven core tables plus the debug table", async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const names = new Set(rows.map((r) => r.table_name));
    for (const t of [
      "sessions",
      "messages",
      "learning_records",
      "misconception_events",
      "assessment_attempts",
      "question_results",
      "idempotency_keys",
      "debug_llm_payloads",
    ]) {
      expect(names.has(t), `missing table ${t}`).toBe(true);
    }
  });

  it("enforces the composite (id, session_id) uniques and key constraints", async () => {
    const { rows } = await pool.query<{ constraint_name: string; constraint_type: string }>(
      `SELECT constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_schema = 'public'`,
    );
    const byName = new Map(rows.map((r) => [r.constraint_name, r.constraint_type]));
    expect(byName.get("messages_id_session")).toBe("UNIQUE");
    expect(byName.get("learning_records_id_session")).toBe("UNIQUE");
    expect(byName.get("attempts_id_session")).toBe("UNIQUE");
    expect(byName.get("messages_session_turn")).toBe("UNIQUE");
    // Composite + check constraints present.
    expect(byName.has("learning_records_source_message_fk")).toBe(true);
    expect(byName.has("attempts_record_fk")).toBe(true);
    expect(byName.has("misconception_events_record_fk")).toBe(true);
  });

  it("has the partial unique index one_pending_eval with its predicate", async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'one_pending_eval'`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].indexdef).toMatch(/UNIQUE/i);
    expect(rows[0].indexdef).toMatch(/WHERE .*eval_status/i);
  });

  it("has the attempt_no IN (1,2) and content length checks", async () => {
    const { rows } = await pool.query<{ constraint_name: string }>(
      `SELECT constraint_name FROM information_schema.check_constraints WHERE constraint_schema = 'public'`,
    );
    const names = new Set(rows.map((r) => r.constraint_name));
    expect(names.has("attempts_attempt_no")).toBe(true);
    expect(names.has("messages_content_len")).toBe(true);
  });
});
