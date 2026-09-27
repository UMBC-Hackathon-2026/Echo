import type { AssessmentQuestion } from "@/lib/contracts/topic";
import type { TopicRubric } from "@/lib/contracts/topic";
import "server-only";
import type { ConceptState, LearningRecord, QuestionResult } from "@/lib/contracts";
import { activeMisconceptionIds } from "./misconception-ids";

export const GATE_VERSION = "1.0.0";
const rank: Record<ConceptState, number> = { not_taught: 0, partially_taught: 1, demonstrated: 2 };

/** Pure assessment: sees only the pinned record and frozen question, never the transcript or rubric. */
export function assessQuestion(record: LearningRecord, question: AssessmentQuestion, topic: { rubricData: TopicRubric }): QuestionResult {
  const active = activeMisconceptionIds(record);
  
  if ("criteria" in question) {
    const earned = question.criteria.filter((criterion) =>
      criterion.requires.every((id: string) => record.concepts[id]?.state === "demonstrated" && !record.concepts[id]?.uncertain)
      && !(criterion.contradictedBy ?? []).some((id: string) => active.has(id)),
    );
    const earnedIds = new Set(earned.map((c) => c.id));
    const fragments = question.fragments.filter((fragment) => {
      switch (fragment.kind) {
        case "fact": return !!fragment.supportsCriterion && earnedIds.has(fragment.supportsCriterion);
        case "context": return fragment.requires.every(({ concept, min }) =>
          record.concepts[concept] && !record.concepts[concept].uncertain && rank[record.concepts[concept].state] >= rank[min as ConceptState]);
        case "hedge": return fragment.requires.length === 1
          && record.concepts[fragment.requires[0].concept]?.state === fragment.exactState;
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
    const conceptIds = topic.rubricData.concepts.map((c) => c.id);
    const blocking = {
      concepts: conceptIds.filter((id: string) => unearned.some((c) => c.requires.includes(id))
        && (!record.concepts[id] || record.concepts[id].state !== "demonstrated" || record.concepts[id].uncertain)),
      misconceptions: [...new Set<string>(question.relevantMisconceptions.filter((id: string) => active.has(id)))],
    };
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
      points: earned.reduce((sum: number, c) => sum + c.points, 0),
      maxPoints: question.criteria.reduce((sum: number, c) => sum + c.points, 0),
      earnedCriteria: earned.map((c) => c.id),
      fragmentIds: fragments.map((f) => f.id),
      answerText: fragments.map((f) => f.text).join(" "),
      blocking,
      nextStep: hints.length ? [...new Set(hints)].join(" ") : null,
    };
  }

  // Dynamic heuristic
  const conceptIds = topic.rubricData.concepts.map((c) => c.id);
  let outcome: QuestionResult["outcome"] = "correct";
  let answerText = question.answerKey?.expectedAnswer || "Yes";
  const blockingConcepts: string[] = [];
  const blockingMisconceptions: string[] = [];
  
  if (active.size > 0) {
    outcome = "misconception";
    answerText = "I think " + [...active].join(", ");
    blockingMisconceptions.push(...active);
  } else {
    for (const cid of conceptIds) {
       if (!record.concepts[cid] || record.concepts[cid].state !== "demonstrated") {
           outcome = "unsure";
           answerText = "I don't know yet.";
           blockingConcepts.push(cid);
       }
    }
  }
  
  return {
    questionId: question.id,
    pairId: question.pairId || question.id,
    outcome,
    points: outcome === "correct" ? 1 : 0,
    maxPoints: 1,
    earnedCriteria: [],
    fragmentIds: [],
    answerText,
    blocking: { concepts: blockingConcepts, misconceptions: blockingMisconceptions },
    nextStep: blockingConcepts.length > 0 ? "Teach " + blockingConcepts[0] : null
  };
}
