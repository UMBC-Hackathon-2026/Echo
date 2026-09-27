import type { TopicRubric } from "@/lib/contracts/topic";
import "server-only";
import type { LearningRecord } from "@/lib/contracts";

/** Teaching only; never call while assessing a pinned snapshot. */
export function selectProbe(
  record: Pick<LearningRecord, "concepts">,
  topic: { rubricData: TopicRubric },
): { id: string; text: string } | null {
  const conceptIds = topic.rubricData.concepts.map((c) => c.id);
  const id = conceptIds.find((id: string) => record.concepts[id]?.state !== "demonstrated" || record.concepts[id]?.uncertain);
  
  if (id) {
    const concept = topic.rubricData.concepts.find((c) => c.id === id);
    return { id, text: concept?.probe || `Explain the concept of ${concept?.name || id}` };
  }
  return null;
}
