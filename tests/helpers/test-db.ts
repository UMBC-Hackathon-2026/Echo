import { loadEnvLocal } from "@/scripts/lib/load-env";
loadEnvLocal();
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/lib/db/schema";
import { CONCEPT_IDS } from "@/lib/contracts";
import type { ConceptId, ConceptState } from "@/lib/contracts";
import type { ValidatedEvaluation } from "@/lib/evaluator/validate";
import type { EvaluationResult } from "@/lib/evaluator/evaluator";

export const TEST_URL = process.env.DATABASE_URL_TEST;
export const hasTestDb = !!TEST_URL;

export function makeTestDb() {
  const ssl = /sslmode=(require|verify)/.test(TEST_URL ?? "") ? { rejectUnauthorized: true } : undefined;
  const pool = new Pool({ connectionString: TEST_URL, max: 5, ssl });
  const db = drizzle(pool, { schema });
  return { pool, db };
}

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query("TRUNCATE sessions RESTART IDENTITY CASCADE");
}

/** Build a scripted successful evaluation with the given concept states. */
export function okEvaluation(
  sessionId: string,
  basedOnTurnIds: string[],
  states: Partial<Record<ConceptId, ConceptState>>,
  model = "fake",
): EvaluationResult {
  const concepts = {} as ValidatedEvaluation["concepts"];
  for (const id of CONCEPT_IDS) {
    concepts[id] = { state: states[id] ?? "not_taught", evidence: [], conflicts: [], uncertain: false, reason: "test" };
  }
  const evaluation: ValidatedEvaluation = { sessionId, basedOnTurnIds, concepts, reports: [] };
  return { ok: true, evaluation, model, latencyMs: 1, attempts: 1 };
}
