import { defaultTopic } from "../helpers/phase2";
import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import { buildResponseSchema } from "@/lib/evaluator/prompt";
import { EvaluatorOutput, ConceptState, CONCEPT_IDS } from "@/lib/contracts";

const ajv = new Ajv({ allErrors: true });

const concept = (id: string, over: Record<string, unknown> = {}) => ({
  id, state: "not_taught", evidence: [], conflicts: [], resolution: "none", reason: "ok", ...over,
});
const validSample = () => ({
  concepts: CONCEPT_IDS.map((id) =>
    id === "base_case"
      ? concept(id, { state: "demonstrated", evidence: [{ turn_id: "t1", quote: "stops at 0" }] })
      : concept(id),
  ),
  misconception_reports: [] as unknown[],
});

describe("evaluator response schema — structural parity with Zod", () => {
  it("schema builds successfully", () => {
    const s = buildResponseSchema(defaultTopic) as any;
    expect(s.required).toEqual(["concepts", "misconception_reports"]);
    expect(s.properties.concepts.items.required).toEqual(["id", "state", "evidence", "conflicts", "resolution", "reason"]);
  });
});
