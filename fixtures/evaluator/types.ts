import type { ConceptId, ConceptState } from "@/lib/contracts";

/**
 * Evaluator fixture: student turns plus the ALLOWED set of states per concept
 * (conservative — a fixture passes only if each concept lands within its set and
 * none is scored higher than allowed). Tuning and held-out sets share no texts.
 */
export interface EvaluatorFixture {
  id: string;
  note?: string;
  turns: string[];
  expect: Record<ConceptId, ConceptState[]>;
  misconceptions?: Array<{ id: string; status: "asserted" | "retracted" }>;
}
