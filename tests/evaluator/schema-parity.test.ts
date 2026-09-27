import { defaultTopic } from "../helpers/phase2";
import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import { buildResponseSchema } from "@/lib/evaluator/prompt";
import { EvaluatorOutput, CONCEPT_IDS } from "@/lib/contracts";
import type { TeachingTopic } from "@/lib/contracts/topic";

const validate = new Ajv({ allErrors: true }).compile(buildResponseSchema(defaultTopic));
const validSample = () => ({
  concepts: CONCEPT_IDS.map(id => ({ id, state: "not_taught", evidence: [] as { turn_id: string; quote: string }[], conflicts: [], resolution: "none", reason: "ok" })),
  misconception_reports: [] as unknown[],
});

describe("evaluator response schema — structural parity with Zod", () => {
  it("accepts the same valid output", () => {
    expect(validate(validSample())).toBe(true);
    expect(EvaluatorOutput.safeParse(validSample()).success).toBe(true);
  });

  it.each([
    ["missing state", (v: ReturnType<typeof validSample>) => { Reflect.deleteProperty(v.concepts[0], "state"); }],
    ["unknown nested field", (v: ReturnType<typeof validSample>) => { Object.assign(v.concepts[0], { trusted: true }); }],
    ["invalid state", (v: ReturnType<typeof validSample>) => { v.concepts[0].state = "mastered"; }],
    ["invalid stance", (v: ReturnType<typeof validSample>) => { v.misconception_reports.push({ id: "m", stance: "invented", evidence: [{ turn_id: "t1", quote: "stop" }] }); }],
  ])("rejects %s at both boundaries", (_name, mutate) => {
    const value = validSample(); mutate(value);
    expect(validate(value)).toBe(false);
    expect(EvaluatorOutput.safeParse(value).success).toBe(false);
  });

  it("keeps provider-incompatible limits in local Zod validation", () => {
    const tooManySpans = validSample();
    tooManySpans.concepts[0].evidence = Array.from({ length: 4 }, () => ({ turn_id: "t1", quote: "stop" }));
    expect(validate(tooManySpans)).toBe(true);
    expect(EvaluatorOutput.safeParse(tooManySpans).success).toBe(false);

    const tooManyConcepts = validSample();
    tooManyConcepts.concepts = Array.from({ length: 21 }, () => tooManyConcepts.concepts[0]);
    expect(validate(tooManyConcepts)).toBe(true);
    expect(EvaluatorOutput.safeParse(tooManyConcepts).success).toBe(false);
  });

  it("builds a Gemini-compatible schema for a dynamic topic", () => {
    const dynamicTopic: TeachingTopic = {
      id: "dynamic-topic",
      name: "Supervised Learning",
      rubricData: {
        concepts: [{ id: "kl_divergence", name: "KL Divergence" }, { id: "cross_entropy", name: "Cross Entropy" }],
        misconceptions: [{ id: "kl_symmetric", name: "KL is symmetric" }],
        questions: [],
      },
    };
    const schema = buildResponseSchema(dynamicTopic);
    const encoded = JSON.stringify(schema);
    expect(encoded).not.toMatch(/"(?:\$schema|minLength|maxLength|pattern|minItems|maxItems)":/);
    expect(schema.properties.concepts.items.properties.id.enum).toEqual(["kl_divergence", "cross_entropy"]);
    expect(() => new Ajv({ allErrors: true }).compile(schema)).not.toThrow();
  });
});
