import { defaultTopic } from "../helpers/phase2";
import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import { buildResponseSchema } from "@/lib/evaluator/prompt";
import { EvaluatorOutput, CONCEPT_IDS } from "@/lib/contracts";

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
    ["too many spans", (v: ReturnType<typeof validSample>) => { v.concepts[0].evidence = Array.from({ length: 4 }, () => ({ turn_id: "t1", quote: "stop" })); }],
    ["invalid stance", (v: ReturnType<typeof validSample>) => { v.misconception_reports.push({ id: "m", stance: "invented", evidence: [{ turn_id: "t1", quote: "stop" }] }); }],
    ["too many concepts", (v: ReturnType<typeof validSample>) => { v.concepts = Array.from({ length: 21 }, () => v.concepts[0]); }],
  ])("rejects %s at both boundaries", (_name, mutate) => {
    const value = validSample(); mutate(value);
    expect(validate(value)).toBe(false);
    expect(EvaluatorOutput.safeParse(value).success).toBe(false);
  });
});
