import { z } from "zod";
import { ConceptId, ConceptState } from "./concepts";

/**
 * Immutable learning record (ARCHITECTURE_REVISED §2). Append-only snapshots;
 * attempts pin a version. Evidence is stored as exact original-text character
 * spans so a review can highlight the student's own words.
 */
export const Span = z
  .object({
    turn_id: z.string(),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    quote: z.string(),
  })
  .strict();
export type Span = z.infer<typeof Span>;

export const ConceptRecordEntry = z
  .object({
    state: ConceptState,
    evidence: z.array(Span),
    conflicts: z.array(Span),
    uncertain: z.boolean(),
    reason: z.string(),
  })
  .strict();
export type ConceptRecordEntry = z.infer<typeof ConceptRecordEntry>;

export const MisconceptionOrigin = z.enum(["seeded", "student"]);
export type MisconceptionOrigin = z.infer<typeof MisconceptionOrigin>;

export const MisconceptionStatus = z.enum(["active", "resolved"]);
export type MisconceptionStatus = z.infer<typeof MisconceptionStatus>;

export const MisconceptionEntry = z
  .object({
    origin: MisconceptionOrigin,
    status: MisconceptionStatus,
    evidence: z.array(Span),
    changed_in_version: z.number().int().nonnegative(),
  })
  .strict();
export type MisconceptionEntry = z.infer<typeof MisconceptionEntry>;

export const LearningRecord = z
  .object({
    id: z.string(),
    session_id: z.string(),
    version: z.number().int().nonnegative(),
    cycle: z.number().int().positive(),
    rubric_version: z.string(),
    validator_version: z.string(),
    based_on_turn_ids: z.array(z.string()),
    concepts: z.record(ConceptId, ConceptRecordEntry),
    misconceptions: z.record(z.string(), MisconceptionEntry),
  })
  .strict();
export type LearningRecord = z.infer<typeof LearningRecord>;
