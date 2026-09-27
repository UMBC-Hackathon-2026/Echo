import { defaultTopic } from "../helpers/phase2";
import { describe, it, expect } from "vitest";
import { assessQuestion } from "@/lib/learner/gate";
import { createInitialRecord } from "@/lib/learner/record";
import { FORM_A } from "@/lib/content/recursion/forms";
import { toAttemptDTO, type AttemptShape, type ResultRow } from "@/lib/session/dto";

const { record } = createInitialRecord({ id: "r0", sessionId: "s1", conceptIds: defaultTopic.rubricData.concepts.map((c: any) => c.id), topicRubricData: defaultTopic.rubricData });
const question = FORM_A.questions[0]; // rec.A.P1
const result = assessQuestion(record, question, defaultTopic);
const rows: ResultRow[] = [{ result, question }];

function shape(status: "in_progress" | "complete"): AttemptShape {
  return { id: "a1", attemptNo: 1, formId: "dynamic.A", formVersion: FORM_A.version, status, results: rows, pinnedRecord: record };
}

describe("public DTO mappers — leakage", () => {
  it("omits answer key and criteria before completion", () => {
    const dto = toAttemptDTO(shape("in_progress"));
    expect(dto.results[0].review).toBeUndefined();
    const json = JSON.stringify(dto);
    expect(json).not.toContain(question.answerKey);
    for (const c of question.criteria) expect(json).not.toContain(c.text);
    for (const f of question.fragments) if (f.kind === "fact") expect(json).not.toContain(f.text);
  });

  it("includes review (answer key + criteria) only after completion", () => {
    const dto = toAttemptDTO(shape("complete"));
    expect(dto.results[0].review?.answerKey).toBe(question.answerKey);
    expect(dto.results[0].review?.criteria.length).toBe(question.criteria.length);
    // still no fragment internals or requirements
    const json = JSON.stringify(dto);
    expect(json).not.toContain("supportsCriterion");
  });

  it("exposes only public question fields", () => {
    const q = toAttemptDTO(shape("in_progress")).results[0].question;
    expect(Object.keys(q).sort()).toEqual(
      ["assumptions", "code", "difficulty", "id", "pairId", "prompt", "type"].sort(),
    );
  });
});
