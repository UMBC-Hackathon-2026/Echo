import { z } from "zod";

/**
 * The five recursion concepts. This is the ONLY allowed concept set; the
 * validation gate rejects any id outside it (ARCHITECTURE_REVISED §2, §5).
 */
export const ConceptId = z.enum([
  "recursive_call",
  "smaller_subproblem",
  "base_case",
  "progress_toward_base_case",
  "return_path",
]);
export type ConceptId = z.infer<typeof ConceptId>;

/** Ordered list; the probe selector walks concepts in this order (§5). */
export const CONCEPT_IDS = ConceptId.options;

export const ConceptState = z.enum([
  "not_taught",
  "partially_taught",
  "demonstrated",
]);
export type ConceptState = z.infer<typeof ConceptState>;
