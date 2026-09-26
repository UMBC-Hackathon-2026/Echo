import "server-only";
import { CONCEPT_IDS } from "@/lib/contracts";
import type { ConceptState, LearningRecord, Question, QuestionResult } from "@/lib/contracts";
import { activeMisconceptionIds } from "./misconception-ids";

export const GATE_VERSION = "1.0.0";
const rank: Record<ConceptState, number> = { not_taught: 0, partially_taught: 1, demonstrated: 2 };

/** Pure assessment: sees only the pinned record and frozen question, never the transcript or rubric. */
export function assessQuestion(record: LearningRecord, question: Question): QuestionResult {
  const active = activeMisconceptionIds(record);
  const earned = question.criteria.filter((criterion) =>
    criterion.requires.every((id) => record.concepts[id].state === "demonstrated" && !record.concepts[id].uncertain)
    && !(criterion.contradictedBy ?? []).some((id) => active.has(id)),
  );
  const earnedIds = new Set(earned.map((c) => c.id));
  const fragments = question.fragments.filter((fragment) => {
    switch (fragment.kind) {
      case "fact": return !!fragment.supportsCriterion && earnedIds.has(fragment.supportsCriterion);
      case "context": return fragment.requires.every(({ concept, min }) =>
        !record.concepts[concept].uncertain && rank[record.concepts[concept].state] >= rank[min]);
      case "hedge": return fragment.requires.length === 1
        && record.concepts[fragment.requires[0].concept].state === fragment.exactState;
      case "misconception": return !!fragment.misconception
        && question.relevantMisconceptions.includes(fragment.misconception) && active.has(fragment.misconception);
      case "uncertain": return false;
    }
  });
  if (!fragments.length) {
    const fallback = question.fragments.find((f) => f.kind === "uncertain");
    if (!fallback) throw new Error("Frozen question is missing its uncertain fragment");
    fragments.push(fallback);
  }
  const unearned = question.criteria.filter((c) => !earnedIds.has(c.id));
  const blocking = {
    concepts: CONCEPT_IDS.filter((id) => unearned.some((c) => c.requires.includes(id))
      && (record.concepts[id].state !== "demonstrated" || record.concepts[id].uncertain)),
    misconceptions: [...new Set(question.relevantMisconceptions.filter((id) => active.has(id)))],
  };
  // Stable rubric order, then authored misconception order. No prompt on the all-correct path.
  const hints = [...blocking.concepts, ...blocking.misconceptions].map((id) => {
    const hint = question.nextStep[id];
    if (!hint) throw new Error("Frozen question is missing a remediation hint");
    return hint;
  });
  return {
    questionId: question.id,
    pairId: question.pairId,
    outcome: blocking.misconceptions.length ? "misconception"
      : earned.length === question.criteria.length ? "correct" : earned.length ? "partial" : "unsure",
    points: earned.reduce((sum, c) => sum + c.points, 0),
    maxPoints: question.criteria.reduce((sum, c) => sum + c.points, 0),
    earnedCriteria: earned.map((c) => c.id),
    fragmentIds: fragments.map((f) => f.id),
    answerText: fragments.map((f) => f.text).join(" "),
    blocking,
    nextStep: hints.length ? [...new Set(hints)].join(" ") : null,
  };
}
