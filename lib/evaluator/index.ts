import type { RubricCriterion } from "@/lib/rubric";

/** A single rubric criterion scored against a learner's explanation. */
export interface CriterionScore {
  criterionId: RubricCriterion["id"];
  /** Whether the required evidence was present. */
  met: boolean;
  /** Model-provided justification / quoted evidence. */
  rationale?: string;
}

export interface EvaluationInput {
  concept: string;
  explanation: string;
  criteria: RubricCriterion[];
}

export interface EvaluationResult {
  scores: CriterionScore[];
  /** Overall pass when all required criteria are met. */
  passed: boolean;
  summary?: string;
}

/**
 * Gemini-backed evaluator. Given a learner's explanation and a rubric, scores
 * each criterion and decides whether the explanation is teachable.
 *
 * STUB: wire up @google/generative-ai (GEMINI_API_KEY) and prompt construction.
 */
export async function evaluateExplanation(
  _input: EvaluationInput,
): Promise<EvaluationResult> {
  throw new Error("evaluateExplanation not implemented");
}
