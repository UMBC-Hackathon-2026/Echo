import { z } from "zod";
import { ConceptId } from "./concepts";

/**
 * Frozen rubric/form content shapes and computed result shapes
 * (ARCHITECTURE_REVISED §2, §5). Questions carry answer keys and criteria and
 * therefore live behind `import 'server-only'` in lib/content; these are just
 * the types.
 */

/** A concept requirement on a fragment. */
export const Req = z
  .object({
    concept: ConceptId,
    min: z.enum(["partially_taught", "demonstrated"]),
  })
  .strict();
export type Req = z.infer<typeof Req>;

export const FragmentKind = z.enum([
  "fact",
  "context",
  "hedge",
  "misconception",
  "uncertain",
]);
export type FragmentKind = z.infer<typeof FragmentKind>;

export const Criterion = z
  .object({
    id: z.string(),
    text: z.string(),
    points: z.number().int().positive(),
    /** all must be `demonstrated` and not uncertain for the criterion to earn. */
    requires: z.array(ConceptId),
    /** active misconception ids that block this criterion. */
    contradictedBy: z.array(z.string()).optional(),
  })
  .strict();
export type Criterion = z.infer<typeof Criterion>;

export const Fragment = z
  .object({
    id: z.string(),
    text: z.string(),
    kind: FragmentKind,
    requires: z.array(Req),
    /** hedges only: shown when the single concept is exactly partially_taught. */
    exactState: z.literal("partially_taught").optional(),
    supportsCriterion: z.string().optional(),
    misconception: z.string().optional(),
  })
  .strict();
export type Fragment = z.infer<typeof Fragment>;

export const QuestionType = z.enum([
  "termination",
  "trace",
  "non-progress",
  "transfer",
]);
export type QuestionType = z.infer<typeof QuestionType>;

export const Question = z
  .object({
    id: z.string(),
    pairId: z.string(),
    type: QuestionType,
    difficulty: z.number().int(),
    steps: z.number().int(),
    prompt: z.string(),
    code: z.string(),
    assumptions: z.string(),
    relevantMisconceptions: z.array(z.string()),
    criteria: z.array(Criterion),
    fragments: z.array(Fragment),
    answerKey: z.string(),
    /** next-step hint per concept or misconception this question can block. */
    nextStep: z.record(z.string(), z.string()),
  })
  .strict();
export type Question = z.infer<typeof Question>;

export const Form = z
  .object({
    id: z.enum(["recursion.A", "recursion.B"]),
    version: z.string(),
    questions: z.array(Question),
  })
  .strict();
export type Form = z.infer<typeof Form>;

export const Outcome = z.enum(["correct", "partial", "misconception", "unsure"]);
export type Outcome = z.infer<typeof Outcome>;

/** Deterministic gate/composer output for one question (computed in Phase 2). */
export interface QuestionResult {
  questionId: string;
  pairId: string;
  outcome: Outcome;
  points: number;
  maxPoints: number;
  earnedCriteria: string[];
  fragmentIds: string[];
  /** exactly the composed, displayed learner answer. */
  answerText: string;
  blocking: { concepts: ConceptId[]; misconceptions: string[] };
  /** null when nothing is blocking. */
  nextStep: string | null;
}
