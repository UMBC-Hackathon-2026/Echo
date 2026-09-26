import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import { RESPONSE_SCHEMA } from "@/lib/evaluator/prompt";
import { EvaluatorOutput, ValidatedConceptEntries, ConceptState, CONCEPT_IDS } from "@/lib/contracts";

/**
 * Keeps the hand-authored Gemini response schema in sync with the Zod contract.
 * (z.toJSONSchema fails on module-defined schemas in this toolchain — an
 * `_idmap` registry error — so the schema is hand-written and pinned by this test.)
 *
 * "Zod-valid" = EvaluatorOutput (shape/strictness/limits) AND ValidatedConceptEntries
 * (known, unique concept ids). For every sample except the ones JSON Schema
 * cannot express (id uniqueness) or the provider rejects (maxItems), ajv and Zod must agree.
 */
const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(JSON.parse(JSON.stringify(RESPONSE_SCHEMA)));
const ajvValid = (s: unknown) => validate(s) === true;
const zodValid = (s: { concepts?: unknown }) =>
  EvaluatorOutput.safeParse(s).success && ValidatedConceptEntries.safeParse(s.concepts).success;

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
  const s = RESPONSE_SCHEMA;
  it("enums match the contract", () => {
    expect(s.properties.concepts.items.properties.id.enum).toEqual([...CONCEPT_IDS]);
    expect(s.properties.concepts.items.properties.state.enum).toEqual([...ConceptState.options]);
    expect(s.properties.concepts.items.properties.resolution.enum).toEqual(["none", "later_correction", "unresolved"]);
    expect(s.properties.misconception_reports.items.properties.stance.enum).toEqual(["asserted", "retracted"]);
  });
  it("required fields match", () => {
    expect(s.required).toEqual(["concepts", "misconception_reports"]);
    expect(s.properties.concepts.items.required).toEqual(["id", "state", "evidence", "conflicts", "resolution", "reason"]);
    expect(s.properties.misconception_reports.items.required).toEqual(["id", "stance", "evidence"]);
  });
  it("max lengths match; provider maxItems exception is explicit", () => {
    const ev = s.properties.concepts.items.properties.evidence;
    expect(ev).not.toHaveProperty("maxItems");
    expect(ev.items.properties.quote.maxLength).toBe(300);
    expect(ev.items.properties.quote.minLength).toBe(1);
    expect(s.properties.concepts.items.properties.reason.maxLength).toBe(240);
  });
  it("strictness (additionalProperties:false) is set everywhere", () => {
    expect(s.additionalProperties).toBe(false);
    expect(s.properties.concepts.items.additionalProperties).toBe(false);
    expect(s.properties.concepts.items.properties.evidence.items.additionalProperties).toBe(false);
    expect(s.properties.misconception_reports.items.additionalProperties).toBe(false);
  });
});

describe("evaluator response schema — sample agreement with Zod", () => {
  it("accepts a valid sample under both", () => {
    const v = validSample();
    expect(ajvValid(v)).toBe(true);
    expect(zodValid(v)).toBe(true);
  });

  const rejections: Array<[string, () => Record<string, unknown>]> = [
    ["extra top-level key", () => ({ ...validSample(), sneaky: 1 })],
    ["extra concept key", () => { const v = validSample(); (v.concepts[0] as Record<string, unknown>).x = 1; return v; }],
    ["missing reason", () => { const v = validSample(); delete (v.concepts[0] as Record<string, unknown>).reason; return v; }],
    ["invalid state", () => { const v = validSample(); (v.concepts[0] as Record<string, unknown>).state = "mastered"; return v; }],
    ["quote too long", () => { const v = validSample(); (v.concepts[2] as { evidence: unknown[] }).evidence = [{ turn_id: "t1", quote: "x".repeat(301) }]; (v.concepts[2] as Record<string, unknown>).state = "demonstrated"; return v; }],
    ["reason too long", () => { const v = validSample(); (v.concepts[0] as Record<string, unknown>).reason = "y".repeat(241); return v; }],
    ["unknown concept id", () => { const v = validSample(); (v.concepts[0] as Record<string, unknown>).id = "not_a_concept"; return v; }],
    ["bad turn_id pattern", () => { const v = validSample(); (v.concepts[1] as { evidence: unknown[] }).evidence = [{ turn_id: "x1", quote: "q" }]; (v.concepts[1] as Record<string, unknown>).state = "demonstrated"; return v; }],
  ];
  for (const [name, make] of rejections) {
    it(`ajv and Zod both reject: ${name}`, () => {
      const sample = make();
      expect(ajvValid(sample)).toBe(false);
      expect(zodValid(sample)).toBe(false);
    });
  }

  it("keeps evidence caps enforced by Zod despite the provider maxItems exception", () => {
    const v = validSample();
    (v.concepts[2] as { evidence: unknown[] }).evidence = Array.from({ length: 4 }, () => ({ turn_id: "t1", quote: "q" }));
    expect(ajvValid(v)).toBe(true);
    expect(zodValid(v)).toBe(false);
  });

  it("documents the divergence JSON Schema cannot express (duplicate id)", () => {
    const v = validSample();
    v.concepts[1] = concept("base_case"); // duplicate of concepts[2]
    expect(ajvValid(v)).toBe(true); // JSON Schema can't require id uniqueness
    expect(zodValid(v)).toBe(false); // the code-level validator catches it
  });
});
