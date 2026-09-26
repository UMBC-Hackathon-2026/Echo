import { describe, it, expect } from "vitest";
import { validateContent, type ContentValidationInput } from "@/lib/content/validate";
import { CONCEPT_IDS } from "@/lib/contracts";
import { FORMS } from "@/lib/content/recursion/forms";
import { SEEDED_MISCONCEPTIONS } from "@/lib/content/recursion/misconceptions";

const seeded = SEEDED_MISCONCEPTIONS.map((m) => ({
  id: m.id,
  resolutionConcepts: m.resolutionConcepts,
  relevantPairs: m.relevantPairs,
}));

// Fresh deep clone of the real content for each broken-copy test.
const fresh = (): ContentValidationInput => ({
  forms: structuredClone(FORMS),
  conceptIds: CONCEPT_IDS,
  seeded,
});

const fired = (input: ContentValidationInput, rule: string): boolean =>
  validateContent(input).some((m) => m.startsWith(rule));

describe("validateContent — real content", () => {
  it("passes on the frozen recursion forms", () => {
    expect(validateContent(fresh())).toEqual([]);
  });
});

describe("validateContent — deliberately broken copies prove each rule fires", () => {
  it("[rule1] a criterion missing its fact fragment", () => {
    const input = fresh();
    const q = input.forms[0].questions[0]; // rec.A.P1
    q.fragments = q.fragments.filter((f) => f.id !== "f.c1");
    expect(fired(input, "[rule1]")).toBe(true);
  });

  it("[rule2] a hedge that drops exactState", () => {
    const input = fresh();
    const q = input.forms[0].questions[0];
    const hedge = q.fragments.find((f) => f.id === "h.base")!;
    delete hedge.exactState;
    expect(fired(input, "[rule2]")).toBe(true);
  });

  it("[rule3] a relevant misconception with no fragment", () => {
    const input = fresh();
    const q = input.forms[0].questions[0];
    q.fragments = q.fragments.filter((f) => f.kind !== "misconception");
    expect(fired(input, "[rule3]")).toBe(true);
  });

  it("[rule4] a pair whose two questions disagree on type", () => {
    const input = fresh();
    input.forms[1].questions[0].type = "trace"; // rec.B.P1 is termination
    expect(fired(input, "[rule4]")).toBe(true);
  });

  it("[rule5] a question missing a nextStep for a blockable concept", () => {
    const input = fresh();
    const q = input.forms[0].questions[0];
    q.nextStep = Object.fromEntries(
      Object.entries(q.nextStep).filter(([k]) => k !== "base_case"),
    );
    expect(fired(input, "[rule5]")).toBe(true);
  });

  it("[rule6] a resolution concept dropped from a relevant question's criteria", () => {
    const input = fresh();
    for (const c of input.forms[0].questions[0].criteria) {
      c.requires = c.requires.filter((x) => x !== "base_case");
    }
    expect(fired(input, "[rule6]")).toBe(true);
  });

  it("[ids] a duplicate question id", () => {
    const input = fresh();
    input.forms[0].questions[1].id = input.forms[0].questions[0].id;
    expect(fired(input, "[ids]")).toBe(true);
  });

  it("[concepts] a criterion requiring an unknown concept", () => {
    const input = fresh();
    // @ts-expect-error deliberately injecting an invalid concept id
    input.forms[0].questions[0].criteria[0].requires = ["not_a_concept"];
    expect(fired(input, "[concepts]")).toBe(true);
  });
});
