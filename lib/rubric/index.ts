/** The five things a sound explanation of recursion must convey. */
export type RubricCriterionId =
  | "recursive_call"
  | "smaller_subproblem"
  | "base_case"
  | "progress_toward_base_case"
  | "return_path";

export interface RubricCriterion {
  id: RubricCriterionId;
  description: string;
  /** What the evaluator should look for to mark this criterion as met. */
  evidence_needed: string;
}

/** The recursion rubric used by the evaluator to score explanations. */
export const recursionRubric: RubricCriterion[] = [
  {
    id: "recursive_call",
    description: "The function calls itself.",
    evidence_needed:
      "Explanation states the function invokes itself (directly or indirectly).",
  },
  {
    id: "smaller_subproblem",
    description: "Each call works on a smaller/simpler input than its caller.",
    evidence_needed:
      "Explanation shows the input shrinks or simplifies on each recursive call.",
  },
  {
    id: "base_case",
    description: "There is a base case that stops the recursion.",
    evidence_needed:
      "Explanation identifies at least one terminating condition returned without recursing.",
  },
  {
    id: "progress_toward_base_case",
    description: "Every recursive call moves the input toward the base case.",
    evidence_needed:
      "Explanation connects the shrinking input to eventually reaching the base case (no infinite recursion).",
  },
  {
    id: "return_path",
    description: "Results propagate back up the call stack to the original caller.",
    evidence_needed:
      "Explanation describes how returned values combine/unwind back to the top-level call.",
  },
];

/** A recursion question posed to the restricted learner. */
export interface RecursionQuestion {
  id: string;
  prompt: string;
  /** Rubric criteria this question is designed to probe. */
  targets: RubricCriterionId[];
}

/**
 * Recursion question bank.
 *
 * STUB: expand with a full set of transfer questions (trace, predict output,
 * find the bug, write a base case, etc.).
 */
export const recursionQuestionBank: RecursionQuestion[] = [
  // TODO: populate question bank
];
