import { CONCEPT_IDS } from "@/lib/contracts";
import type { ConceptId, ConceptState } from "@/lib/contracts";
import type { ValidatedEvaluation } from "@/lib/evaluator/validate";
import type { EvaluatorFixture } from "./types";

const RANK: Record<ConceptState, number> = { not_taught: 0, partially_taught: 1, demonstrated: 2 };

export interface FixtureScore {
  pass: boolean;
  overCredit: ConceptId[];
  underCredit: ConceptId[];
}

/**
 * Conservative scoring. Over-crediting (state higher than allowed) is reported
 * separately from under-crediting (lower than allowed) because over-crediting is
 * the dangerous direction for the demo.
 */
export function scoreFixture(evaluation: ValidatedEvaluation, fixture: EvaluatorFixture): FixtureScore {
  const overCredit: ConceptId[] = [];
  const underCredit: ConceptId[] = [];
  for (const id of CONCEPT_IDS) {
    const allowed = fixture.expect[id];
    const actual = evaluation.concepts[id].state;
    const ranks = allowed.map((s) => RANK[s]);
    const min = Math.min(...ranks);
    const max = Math.max(...ranks);
    if (RANK[actual] > max) overCredit.push(id);
    else if (RANK[actual] < min) underCredit.push(id);
  }
  return { pass: overCredit.length === 0 && underCredit.length === 0, overCredit, underCredit };
}
