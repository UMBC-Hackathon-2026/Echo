import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CONCEPT_IDS, ConceptState, Form } from "@/lib/contracts";
import { RECURSION_RUBRIC } from "@/lib/content/recursion/rubric";
import { FORMS } from "@/lib/content/recursion/forms";

const Example = z.object({
  id: z.string().min(1),
  explanation: z.string().min(1).max(2000),
  expectedState: ConceptState,
  reason: z.string().min(1),
}).strict();

describe("authored rubric examples", () => {
  it.each(CONCEPT_IDS)("%s has one valid example for each teaching state", (id) => {
    const examples = z.array(Example).length(3).parse(RECURSION_RUBRIC[id].examples);
    expect(new Set(examples.map((e) => e.expectedState))).toEqual(new Set(ConceptState.options));
  });

  it("has unique IDs and no assessment identifiers in the prompt examples", () => {
    const examples = Object.values(RECURSION_RUBRIC).flatMap((c) => c.examples);
    expect(new Set(examples.map((e) => e.id)).size).toBe(examples.length);
    // The evaluator may see rubric examples, never the assessment questions or keys.
    for (const example of examples) {
      expect(example.explanation).not.toMatch(/countdown|printStars|factorial|sumTo|listLength|countChars|rec\.[AB]\.P[1-4]/);
    }
  });
});

describe("frozen assessment content", () => {
  it.each(FORMS)("$id conforms to the full strict form schema", (form) => {
    expect(Form.safeParse(form).success).toBe(true);
  });

  it.each(FORMS)("$id does not disclose a stopping condition in its partial base-case hedge", (form) => {
    const question = form.questions.find((q) => q.pairId === "P4")!;
    const hedge = question.fragments.find((f) => f.id === "h.base")!;
    expect(hedge.kind).toBe("hedge");
    expect(hedge.exactState).toBe("partially_taught");
    expect(hedge.requires).toEqual([{ concept: "base_case", min: "partially_taught" }]);
    // Guard the actual regression: these reveal the missing condition/return value.
    expect(hedge.text).not.toMatch(/empty|length|zero|\b0\b|returns?\s+\d/i);
  });
});
