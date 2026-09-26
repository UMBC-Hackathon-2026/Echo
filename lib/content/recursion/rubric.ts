import "server-only";
import type { ConceptId, ConceptState } from "@/lib/contracts";
import { CONCEPT_IDS } from "@/lib/contracts";

/**
 * Recursion rubric (ARCHITECTURE_REVISED §5). Concept definitions the evaluator
 * sees, plus the authored probe asked during teaching. Probes never state the
 * rule they ask about. Server-only: the evaluator reads these; the client never does.
 */
export const RUBRIC_VERSION = "1.0.1";

/** Authored prompt examples for one concept, not held-out evaluation results. */
export interface RubricExample {
  id: string;
  explanation: string;
  expectedState: ConceptState;
  reason: string;
}

export interface RubricConcept {
  id: ConceptId;
  demonstratedWhen: string;
  partialWhen: string;
  /** Asked during teaching only; must not state the rule. */
  probe: string;
  examples: RubricExample[];
}

export const RECURSION_RUBRIC: Record<ConceptId, RubricConcept> = {
  recursive_call: {
    id: "recursive_call",
    demonstratedWhen: "Says the function calls itself inside its own body",
    partialWhen: "Mentions repetition or looping without a self-call",
    probe: "So does the function use itself somehow?",
    examples: [
      {
        id: "recursive_call.not_taught",
        explanation: "The function never calls itself; a for loop does all the repetition.",
        expectedState: "not_taught",
        reason: "Explicitly denies the self-call required by this concept.",
      },
      {
        id: "recursive_call.partially_taught",
        explanation: "The operation repeats until the task is done.",
        expectedState: "partially_taught",
        reason: "Describes repetition without identifying a self-call.",
      },
      {
        id: "recursive_call.demonstrated",
        explanation: "Inside its own body, solve calls solve again.",
        expectedState: "demonstrated",
        reason: "Explicitly identifies the function calling itself from its body.",
      },
    ],
  },
  smaller_subproblem: {
    id: "smaller_subproblem",
    demonstratedWhen: "Says what changes in the input on each call",
    partialWhen: "Says the problem gets simpler without saying how",
    probe: "What's different about the input each time?",
    examples: [
      {
        id: "smaller_subproblem.not_taught",
        explanation: "Every new call receives exactly the same input as the previous call.",
        expectedState: "not_taught",
        reason: "No smaller instance is described; the input is unchanged.",
      },
      {
        id: "smaller_subproblem.partially_taught",
        explanation: "Each call deals with a simpler problem.",
        expectedState: "partially_taught",
        reason: "Calls the problem simpler without specifying how the input changes.",
      },
      {
        id: "smaller_subproblem.demonstrated",
        explanation: "For an integer n above one, the next call receives Math.floor(n / 2).",
        expectedState: "demonstrated",
        reason: "Specifies a concrete reduction of the input on each call.",
      },
    ],
  },
  base_case: {
    id: "base_case",
    demonstratedWhen: "Names a specific stopping condition and what happens there",
    partialWhen: "Says it must stop somewhere, no condition",
    probe: "How does it know when to stop?",
    examples: [
      {
        id: "base_case.not_taught",
        explanation: "There is no stopping branch; it just keeps calling itself.",
        expectedState: "not_taught",
        reason: "Explicitly denies the stopping branch.",
      },
      {
        id: "base_case.partially_taught",
        explanation: "It has to stop at some point.",
        expectedState: "partially_taught",
        reason: "Mentions stopping but supplies no condition or behavior there.",
      },
      {
        id: "base_case.demonstrated",
        explanation: "When remaining equals one, return one immediately without another call.",
        expectedState: "demonstrated",
        reason: "Names a specific stopping condition and what is returned there.",
      },
    ],
  },
  progress_toward_base_case: {
    id: "progress_toward_base_case",
    demonstratedWhen: "Links the changing input to eventually reaching the stop condition",
    partialWhen: "States both ideas without linking them",
    probe: "Why wouldn't it just keep going forever?",
    examples: [
      {
        id: "progress_toward_base_case.not_taught",
        explanation: "Starting from a positive n, adding one on every call will eventually reach zero.",
        expectedState: "not_taught",
        reason: "The claimed change moves away from the proposed stopping condition.",
      },
      {
        id: "progress_toward_base_case.partially_taught",
        explanation: "The input changes, and there is a stopping condition.",
        expectedState: "partially_taught",
        reason: "States the two ideas without connecting the change to reaching the stop.",
      },
      {
        id: "progress_toward_base_case.demonstrated",
        explanation: "Starting with an integer above one, floor-halving makes it smaller each time until it reaches the stopping value one.",
        expectedState: "demonstrated",
        reason: "Connects a strictly decreasing positive integer input to the stated stopping value.",
      },
    ],
  },
  return_path: {
    id: "return_path",
    demonstratedWhen: "Explains results come back and earlier calls finish using them",
    partialWhen: "Says calls return, with no order or combination",
    probe: "After the last call, what happens to the earlier ones?",
    examples: [
      {
        id: "return_path.not_taught",
        explanation: "Earlier calls never receive any value from later calls.",
        expectedState: "not_taught",
        reason: "Denies the return of results to waiting callers.",
      },
      {
        id: "return_path.partially_taught",
        explanation: "The calls return something.",
        expectedState: "partially_taught",
        reason: "Mentions returning without explaining order or how the result is used.",
      },
      {
        id: "return_path.demonstrated",
        explanation: "When the inner call returns, the waiting outer call uses that value to finish its own result, then returns that result to its caller.",
        expectedState: "demonstrated",
        reason: "Explains how returned values let earlier calls finish and propagate their results.",
      },
    ],
  },
};

/**
 * Probe order (§5): the selector returns the probe for the first concept in
 * this order that is not `demonstrated`, or null once all five are demonstrated.
 */
export const PROBE_ORDER: ConceptId[] = [...CONCEPT_IDS];
