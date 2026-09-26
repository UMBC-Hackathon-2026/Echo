import type { LearningRecord } from "@/lib/contracts";

/** Keep a student assertion distinct from the learner's seeded belief of the same kind. */
export const studentMisconceptionKey = (id: string) => `student:${id}`;
export const misconceptionKind = (key: string) => key.startsWith("student:") ? key.slice(8) : key;

export function activeMisconceptionIds(record: Pick<LearningRecord, "misconceptions">): Set<string> {
  return new Set(Object.entries(record.misconceptions)
    .filter(([, entry]) => entry.status === "active")
    .map(([key]) => misconceptionKind(key)));
}
