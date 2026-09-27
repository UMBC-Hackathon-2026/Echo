import { z } from "zod";

export const DynamicConceptSchema = z.object({
  id: z.string(),
  name: z.string(),
  demonstratedWhen: z.string(),
  partialWhen: z.string(),
  probe: z.string(),
  examples: z.array(z.object({
    explanation: z.string(),
    expectedState: z.enum(["not_taught", "partially_taught", "demonstrated"]),
    reason: z.string()
  }))
});

export const DynamicMisconceptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  belief: z.string(),
  openingLine: z.string(),
  resolutionConcepts: z.array(z.string()).optional()
});

export const DynamicQuestionSchema = z.object({
  id: z.string(),
  pairId: z.string(),
  type: z.enum(["trace", "explain", "modify", "other"]),
  text: z.string(),
  answerKey: z.object({
    correctCriteria: z.array(z.string()),
    misconceptionCriteria: z.array(z.string()),
    expectedAnswer: z.string()
  })
});

export const DynamicRubricSchema = z.object({
  topicName: z.string(),
  concepts: z.array(DynamicConceptSchema),
  misconceptions: z.array(DynamicMisconceptionSchema),
  questions: z.array(DynamicQuestionSchema)
});

export type DynamicConcept = z.infer<typeof DynamicConceptSchema>;
export type DynamicMisconception = z.infer<typeof DynamicMisconceptionSchema>;
export type DynamicQuestion = z.infer<typeof DynamicQuestionSchema>;
export type DynamicRubric = z.infer<typeof DynamicRubricSchema>;
