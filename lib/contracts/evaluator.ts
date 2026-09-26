import { z } from "zod";
import { ConceptId, ConceptState } from "./concepts";

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

/**
 * Concept-array boundary schema: enforces that ids are the five known concepts
 * and appear at most once. The full validation gate (Phase 2) also checks
 * evidence provenance; this schema captures the id-shape guarantees the
 * architecture requires (§2, gate rule 1).
 */
export const ValidatedConceptEntries = EvaluatorOutput.shape.concepts.superRefine(
  (arr, ctx) => {
    const seen = new Set<string>();
    const known = ConceptId.options as readonly string[];
    for (const c of arr) {
      if (!known.includes(c.id)) {
        ctx.addIssue({ code: "custom", message: `unknown concept id: ${c.id}` });
      }
      if (seen.has(c.id)) {
        ctx.addIssue({ code: "custom", message: `duplicate concept id: ${c.id}` });
      }
      seen.add(c.id);
    }
  },
);
