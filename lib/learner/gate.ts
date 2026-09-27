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

  /** Authored display text for an id — NEVER returns a raw internal id. */
  const displayText = (entry: { name?: string; belief?: string; description?: string } | undefined): string | null => {
    for (const candidate of [entry?.belief, entry?.name, entry?.description]) {
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
    return null;
  };
  const misconceptionText = (id: string) => displayText(topic.rubricData.misconceptions.find((m) => m.id === id));
  const conceptName = (id: string) => displayText(topic.rubricData.concepts.find((c) => c.id === id));

  // Only misconceptions this question actually declares are relevant. Generated
  // questions carry no per-question scoping today, so default to NOT blocking
  // rather than attaching a belief that has nothing to do with the question.
  const declared = (question as { relevantMisconceptions?: unknown }).relevantMisconceptions;
  const relevantActive = (Array.isArray(declared) ? declared.filter((id): id is string => typeof id === "string") : [])
    .filter((id) => active.has(id));

  let outcome: QuestionResult["outcome"] = "correct";
  let answerText = question.answerKey?.expectedAnswer || "Yes";
  const blockingConcepts: string[] = [];
  const blockingMisconceptions: string[] = [];

  if (relevantActive.length > 0) {
    outcome = "misconception";
    const beliefs = relevantActive.map(misconceptionText).filter((t): t is string => t !== null);
    // Malformed rubric (no authored belief text) must never leak the id.
    answerText = beliefs.length ? `I think ${beliefs.join(" Also, ")}` : "I'm not sure about that.";
    blockingMisconceptions.push(...relevantActive);
  } else {
    for (const cid of conceptIds) {
       if (!record.concepts[cid] || record.concepts[cid].state !== "demonstrated") {
           outcome = "unsure";
           answerText = "I don't know yet.";
           blockingConcepts.push(cid);
       }
    }
  }

  // Anything blocking must produce a next step, or the review row would claim
  // "Met every criterion" next to a non-correct outcome.
  const nextStep = blockingConcepts.length > 0
    ? `Teach ${conceptName(blockingConcepts[0]) ?? "the missing concept"}`
    : blockingMisconceptions.length > 0
      ? "Your learner still holds a belief that blocks this answer. Correct it directly."
      : null;

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
    nextStep,
  };
}
