import type { Question } from "./assessment";
import type { DynamicConcept, DynamicMisconception, DynamicQuestion } from "./dynamic-rubric";

/** Stored topics may predate the full extraction contract; new uploads use DynamicRubricSchema. */
export interface TopicRubric {
  topicName?: string;
  concepts: Array<Pick<DynamicConcept, "id"> & Partial<Omit<DynamicConcept, "id">>>;
  misconceptions: Array<Pick<DynamicMisconception, "id"> & Partial<Omit<DynamicMisconception, "id">> & { description?: string }>;
  questions: AssessmentQuestion[];
}

export type AssessmentQuestion = Question | DynamicQuestion;
export interface TeachingTopic { id: string; name: string; rubricData: TopicRubric }
