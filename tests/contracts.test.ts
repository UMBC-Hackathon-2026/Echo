import { describe, it, expect } from "vitest";
import {
  EvaluatorOutput,
  ValidatedConceptEntries,
  ConceptState,
} from "@/lib/contracts";

const concept = (id: string, state = "not_taught") => ({
  id,
  state,
  evidence: [],
  conflicts: [],
  resolution: "none",
  reason: "",
});

const validOutput = {
  concepts: [concept("base_case", "demonstrated")],
  misconception_reports: [],
};

describe("EvaluatorOutput contract", () => {
  it("accepts a valid sample", () => {
    expect(EvaluatorOutput.safeParse(validOutput).success).toBe(true);
  });

  it("rejects unexpected extra keys (strict)", () => {
    const bad = {
      ...validOutput,
      concepts: [{ ...concept("base_case", "demonstrated"), sneaky: true }],
    };
    expect(EvaluatorOutput.safeParse(bad).success).toBe(false);
  });

  it("rejects an invalid concept state", () => {
    const bad = { ...validOutput, concepts: [concept("base_case", "mastered")] };
    expect(EvaluatorOutput.safeParse(bad).success).toBe(false);
  });

  it("rejects evidence with an empty quote", () => {
    const bad = {
      ...validOutput,
      concepts: [
        {
          ...concept("base_case", "demonstrated"),
          evidence: [{ turn_id: "t1", quote: "" }],
        },
      ],
    };
    expect(EvaluatorOutput.safeParse(bad).success).toBe(false);
  });
});

describe("ValidatedConceptEntries", () => {
  const known = [
    "recursive_call",
    "smaller_subproblem",
    "base_case",
    "progress_toward_base_case",
    "return_path",
  ];

  it("accepts the five known ids, once each", () => {
    expect(ValidatedConceptEntries.safeParse(known.map((id) => concept(id))).success).toBe(true);
  });

  it("rejects an unknown concept id", () => {
    expect(ValidatedConceptEntries.safeParse([concept("made_up")]).success).toBe(false);
  });

  it("rejects a duplicate concept id", () => {
    expect(
      ValidatedConceptEntries.safeParse([concept("base_case"), concept("base_case")]).success,
    ).toBe(false);
  });
});

describe("ConceptState enum", () => {
  it("accepts the three valid states", () => {
    for (const s of ["not_taught", "partially_taught", "demonstrated"]) {
      expect(ConceptState.safeParse(s).success).toBe(true);
    }
  });
  it("rejects an invalid state", () => {
    expect(ConceptState.safeParse("mastered").success).toBe(false);
  });
});
