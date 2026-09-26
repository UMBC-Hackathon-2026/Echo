import type { AssessmentQuestion, AssessmentResult } from "@/components/AssessmentPanel";

/**
 * The "restricted learner" is an AI agent that knows ONLY what the human just
 * taught it — no pretrained knowledge of the concept. It attempts transfer
 * questions using solely the provided explanation, exposing gaps in teaching.
 */
export interface RestrictedLearnerInput {
  concept: string;
  /** The only source material the learner may rely on. */
  explanation: string;
  questions: AssessmentQuestion[];
}

export interface RestrictedLearnerOutput {
  results: AssessmentResult[];
  /** Free-form questions the learner would ask back, signalling unclear teaching. */
  clarifyingQuestions?: string[];
}

/**
 * Runs the restricted learner against a set of questions using only the
 * learner's explanation as context.
 *
 * STUB: implement with a constrained system prompt that forbids outside
 * knowledge and grounds answers strictly in `explanation`.
 */
export async function runRestrictedLearner(
  _input: RestrictedLearnerInput,
): Promise<RestrictedLearnerOutput> {
  throw new Error("runRestrictedLearner not implemented");
}
