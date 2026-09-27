import { describe, expect, it } from "vitest";
import type { DynamicRubric } from "@/lib/contracts/dynamic-rubric";
import { toQuestionResultDTO, toSessionDTO } from "@/lib/session/dto";
import { createInitialRecord } from "@/lib/learner/record";
import { assessQuestion } from "@/lib/learner/gate";
import { validateEvaluation } from "@/lib/evaluator/validate";

const rubric: DynamicRubric = {
  topicName: "Biology",
  concepts: [{ id: "light", name: "Light", demonstratedWhen: "Private demonstration rule", partialWhen: "Private partial rule", probe: "Where does energy come from?", examples: [{ explanation: "Private example", expectedState: "demonstrated", reason: "Private reasoning" }] }],
  misconceptions: [],
  questions: [{ id: "biology.q1", pairId: "P1", type: "explain", text: "What supplies the energy?", answerKey: { expectedAnswer: "Light supplies energy.", correctCriteria: ["Identify light as energy source"], misconceptionCriteria: [] } }],
};
const topic = { id: "biology", name: "Biology", rubricData: rubric };
const { record } = createInitialRecord({ id: "record", sessionId: "session", conceptIds: ["light"], topicRubricData: rubric });
const question = rubric.questions[0];
const result = assessQuestion(record, question, topic);

describe("dynamic topic public mapping", () => {
  it("preserves generated question text without leaking the key before completion", () => {
    const dto = toQuestionResultDTO({ question, result }, false);
    expect(dto.question.prompt).toBe(question.text);
    expect(dto.review).toBeUndefined();
    expect(JSON.stringify(dto)).not.toContain(question.answerKey.expectedAnswer);
  });
  it("completes review without requiring frozen criteria", () => {
    const dto = toQuestionResultDTO({ question, result }, true);
    expect(dto.review).toEqual({ answerKey: question.answerKey.expectedAnswer, criteria: [], guidance: question.answerKey.correctCriteria });
  });
  it("exposes labels and public questions, never rubric definitions or examples", () => {
    const dto = toSessionDTO({ sessionId: "session", topic, record, messages: [], attempts: [], phase: "teaching", revision: 0, cycle: 1 });
    expect(dto.topic.rubricData.concepts).toEqual([{ id: "light", name: "Light" }]);
    const json = JSON.stringify(dto);
    expect(json).not.toContain("Private");
    expect(json).not.toContain("answerKey");
    expect(json).not.toContain("demonstratedWhen");
  });
});

describe("dynamic evaluator validation", () => {
  it("validates all 20 generated concepts", () => {
    const concepts = Array.from({ length: 20 }, (_, i) => ({ ...rubric.concepts[0], id: `concept${i}` }));
    const output = { concepts: concepts.map(c => ({ id: c.id, state: "not_taught", evidence: [], conflicts: [], resolution: "none", reason: "untaught" })), misconception_reports: [] };
    const validated = validateEvaluation(output, { sessionId: "session", topic: { ...topic, rubricData: { ...rubric, concepts } }, turns: [] });
    expect(Object.keys(validated.concepts)).toHaveLength(20);
  });
  it("rejects malformed nested fields before applying any state", () => {
    expect(() => validateEvaluation({ concepts: [{ id: "light", state: "demonstrated", evidence: [], conflicts: [], reason: "ok", resolution: "invented" }], misconception_reports: [] }, { sessionId: "session", topic, turns: [] })).toThrow();
  });
});
