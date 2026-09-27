import { z } from "zod";

const text = z.string().trim().min(1).max(4000);
const id = z.string().min(1).max(100).regex(/^[a-zA-Z][a-zA-Z0-9_.-]*$/)
  .refine(value => !["__proto__", "constructor", "prototype"].includes(value), "Reserved ID");

export const DynamicConceptSchema = z.object({
  id, name: text, demonstratedWhen: text, partialWhen: text, probe: text,
  examples: z.array(z.object({
    explanation: text,
    expectedState: z.enum(["not_taught", "partially_taught", "demonstrated"]),
    reason: text,
  }).strict()).min(1).max(10),
}).strict();

export const DynamicMisconceptionSchema = z.object({
  id, name: text, belief: text, openingLine: text,
  resolutionConcepts: z.array(id).min(1).max(20),
}).strict();

export const DynamicQuestionSchema = z.object({
  id, pairId: id,
  type: z.enum(["trace", "explain", "modify", "other"]),
  text,
  answerKey: z.object({
    correctCriteria: z.array(text).min(1).max(20),
    misconceptionCriteria: z.array(text).max(20),
    expectedAnswer: text,
  }).strict(),
}).strict();

export const DynamicRubricShape = z.object({
  topicName: z.string().trim().min(1).max(200),
  concepts: z.array(DynamicConceptSchema).min(1).max(20),
  misconceptions: z.array(DynamicMisconceptionSchema).max(20),
  questions: z.array(DynamicQuestionSchema).min(1).max(20),
}).strict();

export const DynamicRubricSchema = DynamicRubricShape.superRefine((rubric, ctx) => {
  for (const field of ["concepts", "misconceptions", "questions"] as const) {
    const seen = new Set<string>();
    rubric[field].forEach((entry, index) => {
      if (seen.has(entry.id)) ctx.addIssue({ code: "custom", path: [field, index, "id"], message: "Duplicate ID" });
      seen.add(entry.id);
    });
  }
  const concepts = new Set(rubric.concepts.map(c => c.id));
  rubric.misconceptions.forEach((m, index) => {
    if (concepts.has(m.id)) ctx.addIssue({ code: "custom", path: ["misconceptions", index, "id"], message: "Concept and misconception IDs must differ" });
    if (new Set(m.resolutionConcepts).size !== m.resolutionConcepts.length || m.resolutionConcepts.some(c => !concepts.has(c))) {
      ctx.addIssue({ code: "custom", path: ["misconceptions", index, "resolutionConcepts"], message: "Resolution must reference unique, existing concepts" });
    }
  });
});

export type DynamicConcept = z.infer<typeof DynamicConceptSchema>;
export type DynamicMisconception = z.infer<typeof DynamicMisconceptionSchema>;
export type DynamicQuestion = z.infer<typeof DynamicQuestionSchema>;
export type DynamicRubric = z.infer<typeof DynamicRubricSchema>;
