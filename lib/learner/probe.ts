import "server-only";
import { CONCEPT_IDS } from "@/lib/contracts";
import type { LearningRecord } from "@/lib/contracts";
import { RECURSION_RUBRIC } from "@/lib/content/recursion/rubric";

/** Teaching only; never call while assessing a pinned snapshot. */
export function selectProbe(record: Pick<LearningRecord, "concepts">): { id: string; text: string } | null {
  const id = CONCEPT_IDS.find((id) => record.concepts[id].state !== "demonstrated" || record.concepts[id].uncertain);
  return id ? { id, text: RECURSION_RUBRIC[id].probe } : null;
}
