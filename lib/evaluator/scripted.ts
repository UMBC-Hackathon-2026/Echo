import "server-only";
import type { ConceptId, ConceptState, Span } from "@/lib/contracts";
import type { Evaluator, EvaluateArgs, EvaluationResult } from "./evaluator";
import type { ValidatedEvaluation } from "./validate";
import type { StudentTurn } from "./provenance";

/**
 * SCRIPTED_EVALUATOR_SENTINEL_do_not_ship
 *
 * Deterministic evaluator for E2E ONLY. It is selected exclusively by the
 * provider through a guarded dynamic import that runs only when
 * NODE_ENV !== "production" and E2E_EVALUATOR === "scripted"; the production
 * build never imports it. `scripts/check-bundle.ts` scans the built client AND
 * server output for the sentinel above to prove it never ships.
 *
 * It maps the student's OWN words to concept states with per-turn regex
 * provenance, so a keyword-stuffed explanation that names "base case" but never
 * states a concrete stopping condition (n === 0 / reaches 0) does NOT earn
 * base_case — the same discrimination the live evaluator must make.
 */
export const SCRIPTED_SENTINEL = "SCRIPTED_EVALUATOR_SENTINEL_do_not_ship";

// Case-insensitive detectors. A concept is `demonstrated` iff one of its
// patterns matches a single student turn (the match is the evidence span).
const CONCEPT_PATTERNS: Record<ConceptId, RegExp> = {
  recursive_call: /calls?\s+itself/i,
  smaller_subproblem: /smaller\s+(?:n|input|sub-?problem|value)|each\s+call\s+works\s+on\s+a\s+smaller/i,
  base_case: /n\s*===?\s*0|n\s+reaches\s+0|reaches\s+0|when\s+n\s+is\s+0|n\s+is\s+0/i,
  progress_toward_base_case: /reach(?:es)?\s+0|reaching\s+0|must\s+reach|gets?\s+to\s+0|down\s+to\s+0|eventually\s+reach/i,
  return_path: /returns?\s+(?:the\s+)?result|comes?\s+back|combine[sd]?\s+on\s+the\s+way\s+back/i,
};

function firstMatch(turns: readonly StudentTurn[], pattern: RegExp): Span | null {
  for (const t of turns) {
    const m = pattern.exec(t.text);
    if (m) return { turn_id: t.turn_id, start: m.index, end: m.index + m[0].length, quote: m[0] };
  }
  return null;
}

export class ScriptedEvaluator implements Evaluator {
  async evaluate({ sessionId, turns, topic }: EvaluateArgs): Promise<EvaluationResult> {
    if (!topic) throw new Error("Missing topic");
    const concepts = {} as ValidatedEvaluation["concepts"];
    
    for (const c of topic.rubricData.concepts) {
      const id = c.id;
      // In tests, if the concept ID matches our known ones, use the pattern, else fallback to the ID itself
      const pattern = CONCEPT_PATTERNS[id] || new RegExp(id, "i");
      const span = firstMatch(turns, pattern);
      const state: ConceptState = span ? "demonstrated" : "not_taught";
      concepts[id] = {
        state,
        evidence: span ? [span] : [],
        conflicts: [],
        uncertain: false,
        reason: span ? `scripted: matched "${span.quote}"` : "scripted: not stated",
      };
    }
    const evaluation: ValidatedEvaluation = {
      sessionId,
      basedOnTurnIds: turns.map((t) => t.turn_id),
      concepts,
      reports: [],
    };
    return { ok: true, evaluation, model: "scripted", latencyMs: 0, attempts: 1 };
  }
}
