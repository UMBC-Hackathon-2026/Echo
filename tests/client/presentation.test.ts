import { describe, expect, it } from "vitest";
import { identifierLabel, questionTypeLabel, rubricItemLabel } from "@/lib/client/presentation";

describe("dynamic topic presentation", () => {
  it("prefers sanitized rubric names and derives readable fallbacks", () => {
    expect(rubricItemLabel({ id: "photosynthesis.light_reactions", name: "Light reactions" })).toBe("Light reactions");
    expect(rubricItemLabel({ id: "photosynthesis.light_reactions" })).toBe("Photosynthesis Light Reactions");
    expect(identifierLabel("student:unsupported-claim")).toBe("Student:Unsupported Claim");
  });

  it.each([
    ["termination", "Termination"],
    ["trace", "Trace"],
    ["non-progress", "Non-progress"],
    ["transfer", "Transfer"],
    ["explain", "Explain"],
    ["modify", "Modify"],
    ["other", "Other"],
    ["future-question-type", "Question"],
  ])("renders question type %s defensively", (type, label) => {
    expect(questionTypeLabel(type)).toBe(label);
  });
});
