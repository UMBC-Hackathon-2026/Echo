import { CONCEPT_IDS, LearningRecord } from "@/lib/contracts";
import type { ConceptId, ConceptState, EvaluatorOutput } from "@/lib/contracts";
import type { StudentTurn } from "@/lib/evaluator/provenance";

export function turn(turn_id: string, text: string): StudentTurn {
  return { session_id: "session", turn_id, role: "student", text };
}

export const defaultTopic = {
  id: "test",
  name: "Recursion",
  rubricData: {
    concepts: CONCEPT_IDS.map((id) => ({ id, name: id, examples: [] })),
    misconceptions: [{ id: "recursion_runs_forever", description: "Runs forever", resolutionConcepts: ["base_case", "progress_toward_base_case"] }],
    questions: []
  }
};

export function proposal(id: ConceptId = "base_case", text = "It stops at zero.", turn_id = "t1"): EvaluatorOutput {
  return {
    concepts: [{ id, state: "demonstrated", evidence: [{ turn_id, quote: text }], conflicts: [], resolution: "none", reason: "Fixture evaluator judgement" }],
    misconception_reports: [],
  };
}

export function recordWith(states: ConceptState | readonly ConceptState[], active = false): LearningRecord {
  const record = LearningRecord.parse({
    id: "r0", session_id: "session", version: 0, cycle: 1,
    rubric_version: "fixture", validator_version: "fixture", based_on_turn_ids: [],
    concepts: Object.fromEntries(CONCEPT_IDS.map((id) => [id, {
      state: "not_taught", evidence: [], conflicts: [], uncertain: false, reason: "Fixture state",
    }])),
    misconceptions: { recursion_runs_forever: { origin: "seeded", status: "active", evidence: [], changed_in_version: 0 } },
  });
  CONCEPT_IDS.forEach((id, index) => {
    record.concepts[id].state = typeof states === "string" ? states : states[index];
  });
  record.misconceptions.recursion_runs_forever.status = active ? "active" : "resolved";
  return record;
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
