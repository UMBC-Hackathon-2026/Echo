import "server-only";
import type { ConceptId } from "@/lib/contracts";
import { CONCEPT_IDS } from "@/lib/contracts";

/**
 * Recursion rubric (ARCHITECTURE_REVISED §5). Concept definitions the evaluator
 * sees, plus the authored probe asked during teaching. Probes never state the
 * rule they ask about. Server-only: the evaluator reads these; the client never does.
 */
export const RUBRIC_VERSION = "1.0.0";

export interface RubricConcept {
  id: ConceptId;
  demonstratedWhen: string;
  partialWhen: string;
  /** Asked during teaching only; must not state the rule. */
  probe: string;
}

export const RECURSION_RUBRIC: Record<ConceptId, RubricConcept> = {
  recursive_call: {
    id: "recursive_call",
    demonstratedWhen: "Says the function calls itself inside its own body",
    partialWhen: "Mentions repetition or looping without a self-call",
    probe: "So does the function use itself somehow?",
  },
  smaller_subproblem: {
    id: "smaller_subproblem",
    demonstratedWhen: "Says what changes in the input on each call",
    partialWhen: "Says the problem gets simpler without saying how",
    probe: "What's different about the input each time?",
  },
  base_case: {
    id: "base_case",
    demonstratedWhen: "Names a specific stopping condition and what happens there",
    partialWhen: "Says it must stop somewhere, no condition",
    probe: "How does it know when to stop?",
  },
  progress_toward_base_case: {
    id: "progress_toward_base_case",
    demonstratedWhen: "Links the changing input to eventually reaching the stop condition",
    partialWhen: "States both ideas without linking them",
    probe: "Why wouldn't it just keep going forever?",
  },
  return_path: {
    id: "return_path",
    demonstratedWhen: "Explains results come back and earlier calls finish using them",
    partialWhen: "Says calls return, with no order or combination",
    probe: "After the last call, what happens to the earlier ones?",
  },
};

/**
 * Probe order (§5): the selector returns the probe for the first concept in
 * this order that is not `demonstrated`, or null once all five are demonstrated.
 */
export const PROBE_ORDER: ConceptId[] = [...CONCEPT_IDS];
