import "server-only";
import { CONCEPT_IDS, EvaluatorOutput, ValidatedConceptEntries } from "@/lib/contracts";
import type { ConceptId, ConceptRecordEntry, Span } from "@/lib/contracts";
import { SEEDED_MISCONCEPTIONS } from "@/lib/content/recursion/misconceptions";
import { indexStudentTurns, resolveEvidenceList, turnNumber, type StudentTurn } from "./provenance";

export const VALIDATOR_VERSION = "1.0.0";

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
  input: { sessionId: string; turns: readonly StudentTurn[] },
): ValidatedEvaluation {
  const output = EvaluatorOutput.parse(raw);
  const entries = ValidatedConceptEntries.parse(output.concepts);
  const knownMisconceptions = new Set(SEEDED_MISCONCEPTIONS.map((m) => m.id));
  if (output.misconception_reports.some((r) => !knownMisconceptions.has(r.id))) {
    throw new Error("Unknown misconception id");
  }
  const turns = indexStudentTurns(input.sessionId, input.turns);
  const concepts = Object.fromEntries(CONCEPT_IDS.map((id) => {
    const proposed = entries.find((c) => c.id === id);
    if (!proposed) return [id, { state: "not_taught", evidence: [], conflicts: [], uncertain: false, reason: "not assessed" }];
    const evidence = resolveEvidenceList(proposed.evidence, turns);
    const conflicts = resolveEvidenceList(proposed.conflicts, turns);
    let state = proposed.state;
    let reason = proposed.reason;
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
    const evidence = resolveEvidenceList(report.evidence, turns);
    return evidence.length ? [{ ...report, evidence }] : [];
  });
  return {
    sessionId: input.sessionId,
    basedOnTurnIds: [...turns.keys()].sort((a, b) => turnNumber(a) - turnNumber(b)),
    concepts,
    reports,
  };
}
