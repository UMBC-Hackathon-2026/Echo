import "server-only";
import type { LearningRecord } from "@/lib/contracts";

/** Teaching only; never call while assessing a pinned snapshot. */
export function selectProbe(
  record: Pick<LearningRecord, "concepts">,
  topic: { rubricData: any },
): { id: string; text: string } | null {
  const conceptIds = topic.rubricData.concepts.map((c: any) => c.id);
  const id = conceptIds.find((id: string) => record.concepts[id]?.state !== "demonstrated" || record.concepts[id]?.uncertain);
  
  if (id) {
    const concept = topic.rubricData.concepts.find((c: any) => c.id === id);
    return { id, text: concept?.probe || `Explain the concept of ${concept?.name || id}` };
  }
  return null;
}
