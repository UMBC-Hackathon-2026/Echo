import "server-only";
import { CONCEPT_IDS, LearningRecord } from "@/lib/contracts";
import { RUBRIC_VERSION } from "@/lib/content/recursion/rubric";
import { VALIDATOR_VERSION, type ValidatedEvaluation } from "@/lib/evaluator/validate";
import { updateMisconceptions } from "./misconceptions";

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** IDs come from the caller; no database, clock, randomness, or provider side effects. */
export function createInitialRecord(input: { id: string; sessionId: string }) {
  const concepts = LearningRecord.shape.concepts.parse(Object.fromEntries(CONCEPT_IDS.map((id) => [id, {
    state: "not_taught", evidence: [], conflicts: [], uncertain: false, reason: "not assessed",
  }])));
  const lifecycle = updateMisconceptions({}, concepts, [], 0);
  const record = LearningRecord.parse({
    id: input.id, session_id: input.sessionId, version: 0, cycle: 1,
    rubric_version: RUBRIC_VERSION, validator_version: VALIDATOR_VERSION,
    based_on_turn_ids: [], concepts, misconceptions: lifecycle.misconceptions,
  });
  return freeze({ record, events: lifecycle.events });
}

export function createLearningRecord(input: {
  id: string;
  cycle: number;
  previous: LearningRecord;
  evaluation: ValidatedEvaluation;
}) {
  const { previous, evaluation } = input;
  if (input.id === previous.id || evaluation.sessionId !== previous.session_id
    || input.cycle < previous.cycle
    || previous.based_on_turn_ids.some((id) => !evaluation.basedOnTurnIds.includes(id))) {
    throw new Error("New snapshot must preserve session identity and teaching history");
  }
  const version = previous.version + 1;
  const lifecycle = updateMisconceptions(previous.misconceptions, evaluation.concepts, evaluation.reports, version);
  const record = LearningRecord.parse({
    id: input.id, session_id: previous.session_id, version, cycle: input.cycle,
    rubric_version: RUBRIC_VERSION, validator_version: VALIDATOR_VERSION,
    based_on_turn_ids: evaluation.basedOnTurnIds,
    concepts: evaluation.concepts, misconceptions: lifecycle.misconceptions,
  });
  return freeze({ record, events: lifecycle.events });
}
