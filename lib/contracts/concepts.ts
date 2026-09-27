import { z } from "zod";

export const ConceptId = z.string();
export type ConceptId = string;

export const CONCEPT_IDS = [
  "recursive_call",
  "smaller_subproblem",
  "base_case",
  "progress_toward_base_case",
  "return_path",
];

export const ConceptState = z.enum([
  "not_taught",
  "partially_taught",
  "demonstrated",
]);
export type ConceptState = z.infer<typeof ConceptState>;
