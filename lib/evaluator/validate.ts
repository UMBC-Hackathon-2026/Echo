import { EvaluatorOutput } from "@/lib/contracts";
import type { TeachingTopic } from "@/lib/contracts/topic";
import "server-only";
import type { ConceptId, ConceptRecordEntry, Span } from "@/lib/contracts";

import { indexStudentTurns, resolveEvidenceList, turnNumber, type StudentTurn } from "./provenance";

export const VALIDATOR_VERSION = "1.1.0";

export interface VerifiedMisconceptionReport {
  id: string;
  stance: "asserted" | "retracted";
  evidence: Span[];
}

export interface ValidatedEvaluation {
  sessionId: string;
  basedOnTurnIds: string[];
  concepts: Record<ConceptId, ConceptRecordEntry>;
  reports: VerifiedMisconceptionReport[];
}

/** Throws on malformed model output; callers must mark evaluation failed, never apply part. */
export function validateEvaluation(
  raw: unknown,
  input: { sessionId: string; turns: readonly StudentTurn[]; topic: TeachingTopic },
): ValidatedEvaluation {
  const output = EvaluatorOutput.parse(raw);

  const knownConceptIds = new Set(input.topic.rubricData.concepts.map((c) => c.id));
  const seenConcepts = new Set();
  for (const c of output.concepts) {
    if (seenConcepts.has(c.id)) throw new Error("Duplicate concept");
    seenConcepts.add(c.id);
    if (!knownConceptIds.has(c.id)) throw new Error("Unknown concept");
    if (!["not_taught", "partially_taught", "demonstrated"].includes(c.state)) throw new Error("Bad state");
    if (c.evidence) {
      if (c.evidence.length > 3) throw new Error("Too many spans");
      for (const span of c.evidence) {
        if (!span.quote || span.quote === "") throw new Error("Empty quote");
      }
    }
  }

  const knownMisconceptions = new Set(input.topic.rubricData.misconceptions.map((m) => m.id));
  if (output.misconception_reports.some((r) => !knownMisconceptions.has(r.id))) {
    throw new Error("Unknown misconception id");
  }
  
  const conceptIds = input.topic.rubricData.concepts.map((c) => c.id);
  const turns = indexStudentTurns(input.sessionId, input.turns);
  
  const entries = output.concepts;
  const concepts = Object.fromEntries(conceptIds.map((id: string) => {
    const proposed = entries.find((c) => c.id === id);
    if (!proposed) return [id, { state: "not_taught", evidence: [], conflicts: [], uncertain: false, reason: "not assessed" }];
    const evidence = resolveEvidenceList(proposed.evidence || [], turns);
    const conflicts = resolveEvidenceList(proposed.conflicts || [], turns);
    let state = proposed.state;
    let reason = proposed.reason || "";
    if (state !== "not_taught" && evidence.length === 0) {
      state = "not_taught";
      reason = "No verifiable evidence in the cited student turns.";
    }
    const latestSupport = Math.max(-1, ...evidence.map((s) => turnNumber(s.turn_id)));
    const latestConflict = Math.max(-1, ...conflicts.map((s) => turnNumber(s.turn_id)));
    const corrected = proposed.resolution === "later_correction" && latestSupport > latestConflict;
    const uncertain = conflicts.length > 0 && !corrected;
    if (uncertain) {
      if (state === "demonstrated") state = "partially_taught";
      reason = "Verified contradictory teaching remains unresolved.";
    }
    return [id, { state, evidence, conflicts, uncertain, reason }];
  })) as Record<ConceptId, ConceptRecordEntry>;

  const reports = output.misconception_reports.flatMap((report) => {
    const evidence = resolveEvidenceList(report.evidence || [], turns);
    return evidence.length ? [{ ...report, evidence }] : [];
  });
  return {
    sessionId: input.sessionId,
    basedOnTurnIds: [...turns.keys()].sort((a, b) => turnNumber(a) - turnNumber(b)),
    concepts,
    reports,
  };
}
