import "server-only";
import type { ConceptId, ConceptState } from "@/lib/contracts";

/**
 * Seeded misconception (ARCHITECTURE_REVISED §2, §5). The learner starts every
 * session believing this; it is never attributed to the student. Its resolution
 * rule is computed in code, not authored per question.
 */
export interface SeededMisconception {
  id: string;
  /** The learner's opening line, spoken at session start. */
  openingLine: string;
  /** Shown to the student as the learner's starting belief. */
  label: string;
  /** Concepts whose demonstration resolves the belief (used by §5 rule 6). */
  resolutionConcepts: ConceptId[];
  /** Questions this belief is relevant to (by pair id). */
  relevantPairs: string[];
}

export const RECURSION_RUNS_FOREVER: SeededMisconception = {
  id: "recursion_runs_forever",
  openingLine: "Wait, doesn't a function calling itself just run forever?",
  label: "The learner's starting belief",
  resolutionConcepts: ["base_case", "progress_toward_base_case"],
  relevantPairs: ["P1", "P3"],
};

export const SEEDED_MISCONCEPTIONS: SeededMisconception[] = [
  RECURSION_RUNS_FOREVER,
];

/**
 * Resolution rule (§2): the seeded belief resolves once `base_case` is
 * demonstrated and `progress_toward_base_case` is at least partially taught.
 * A later snapshot that no longer meets this reactivates it.
 */
export function isRecursionRunsForeverResolved(
  states: Partial<Record<ConceptId, ConceptState>>,
): boolean {
  const base = states.base_case;
  const progress = states.progress_toward_base_case;
  return (
    base === "demonstrated" &&
    (progress === "partially_taught" || progress === "demonstrated")
  );
}
