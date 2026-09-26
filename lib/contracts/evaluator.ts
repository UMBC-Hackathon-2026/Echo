import { z } from "zod";
import { ConceptState } from "./concepts";

/**
 * Evaluator (Gemini) output contract. Copied from ARCHITECTURE_REVISED §2.
 * The evaluator sees the rubric + student turns only; it never sees questions,
 * answer keys, criteria, or fragments. Validation can only lower states.
 */
export const EvidenceRef = z
  .object({
    turn_id: z.string().regex(/^t\d+$/),
    quote: z.string().min(1).max(300),
  })
  .strict();
export type EvidenceRef = z.infer<typeof EvidenceRef>;

export const EvaluatorOutput = z
  .object({
    concepts: z
      .array(
        z
          .object({
            id: z.string(), // checked against ConceptId in code (validation gate)
            state: ConceptState,
            evidence: z.array(EvidenceRef).max(3),
            conflicts: z.array(EvidenceRef).max(3),
            resolution: z.enum(["none", "later_correction", "unresolved"]),
            reason: z.string().max(240),
          })
          .strict(),
      )
      .max(10),
    misconception_reports: z
      .array(
        z
          .object({
            id: z.string(),
            stance: z.enum(["asserted", "retracted"]),
            evidence: z.array(EvidenceRef).min(1).max(3),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();
export type EvaluatorOutput = z.infer<typeof EvaluatorOutput>;

export type EvaluatorResolution = EvaluatorOutput["concepts"][number]["resolution"];
