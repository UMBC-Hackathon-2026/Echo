import { describe, expect, it } from "vitest";
import { CONCEPT_IDS, ConceptState } from "@/lib/contracts";
import { FORMS } from "@/lib/content/recursion/forms";
import { assessQuestion } from "@/lib/learner/gate";
import { selectProbe } from "@/lib/learner/probe";
import { deepFreeze, recordWith } from "./helpers/phase2";

const questions = FORMS.flatMap((form) => form.questions);
const p1 = questions.find((q) => q.id === "rec.A.P1")!;
const combinations = Array.from({ length: 3 ** 5 }, (_, number) => {
  const states = CONCEPT_IDS.map((_, index) => ConceptState.options[Math.floor(number / 3 ** index) % 3]);
  return { name: states.join("/"), states };
});

describe("deterministic answers and scoring", () => {
  it("shows only uncertainty without teaching or a relevant active misconception", () => {
    const record = recordWith("not_taught");
    for (const question of questions) {
      const result = assessQuestion(record, question);
      expect(result).toMatchObject({ points: 0, outcome: "unsure", earnedCriteria: [] });
      expect(result.fragmentIds).toEqual(question.fragments.filter((f) => f.kind === "uncertain").map((f) => f.id));
    }
  });

  it("does not turn a partial base case into knowledge of smaller inputs or points", () => {
    const record = recordWith("not_taught", true);
    record.concepts.base_case.state = "partially_taught";
    const result = assessQuestion(record, p1);
    expect(result.fragmentIds).toEqual(["h.base", "m.forever"]);
    expect(result.points).toBe(0);
    expect(result.outcome).toBe("misconception");
    expect(result.answerText).not.toMatch(/smaller|Taking 1 away|When n is 0/);
  });

  it("retains a relevant misconception even when teaching would otherwise satisfy every criterion", () => {
    const result = assessQuestion(recordWith("demonstrated", true), p1);
    expect(result.fragmentIds).toContain("m.forever");
    expect(result.fragmentIds).not.toContain("f.c1");
    expect(result.points).toBe(0);
    expect(result.blocking.concepts).toEqual([]);
    expect(result.blocking.misconceptions).toEqual(["recursion_runs_forever"]);
    expect(result.nextStep).toBe(p1.nextStep.recursion_runs_forever);
  });

  it("never marks demonstrated concepts failed just because a multi-concept criterion failed", () => {
    const record = recordWith("demonstrated");
    record.concepts.progress_toward_base_case.state = "not_taught";
    const result = assessQuestion(record, p1);
    expect(result).toMatchObject({ points: 1, outcome: "partial", earnedCriteria: ["c1"] });
    expect(result.blocking.concepts).toEqual(["progress_toward_base_case"]);
  });

  it.each(CONCEPT_IDS)("blocks uncertain %s from facts, context, and points", (id) => {
    const record = recordWith("demonstrated");
    record.concepts[id].uncertain = true;
    for (const question of questions) {
      const result = assessQuestion(record, question);
      for (const criterion of question.criteria.filter((c) => c.requires.includes(id))) {
        expect(result.earnedCriteria).not.toContain(criterion.id);
      }
      for (const fragment of question.fragments.filter((f) => f.kind === "context" && f.requires.some((r) => r.concept === id))) {
        expect(result.fragmentIds).not.toContain(fragment.id);
      }
    }
  });

  it("has no remediation when every criterion is met and ignores unrelated beliefs", () => {
    const record = recordWith("demonstrated");
    record.misconceptions.unrelated = { origin: "student", status: "active", evidence: [], changed_in_version: 1 };
    for (const question of questions) {
      const result = assessQuestion(record, question);
      expect(result.outcome).toBe("correct");
      expect(result.points).toBe(result.maxPoints);
      expect(result.blocking).toEqual({ concepts: [], misconceptions: [] });
      expect(result.nextStep).toBeNull();
    }
  });

  it("blocks a student assertion even after the seeded belief has resolved", () => {
    const record = recordWith("demonstrated");
    record.misconceptions["student:recursion_runs_forever"] = { origin: "student", status: "active", evidence: [], changed_in_version: 1 };
    expect(assessQuestion(record, p1).outcome).toBe("misconception");
  });

  it("does not mutate pinned records/questions and is repeatable", () => {
    const record = deepFreeze(recordWith("partially_taught", true));
    const question = deepFreeze(structuredClone(p1));
    const before = JSON.stringify({ record, question });
    expect(assessQuestion(record, question)).toEqual(assessQuestion(record, question));
    expect(JSON.stringify({ record, question })).toBe(before);
  });

  it.each(combinations)("checks all eight questions for $name with both misconception and uncertainty states", ({ states }) => {
    for (const active of [false, true]) {
      for (const uncertain of [false, true]) {
        const record = recordWith(states, active);
        for (const concept of Object.values(record.concepts)) concept.uncertain = uncertain;
        for (const question of questions) {
          const result = assessQuestion(record, question);
          // Independent oracle derived from authored requirements, not the implementation's helpers.
          const expectedEarned = question.criteria.filter((c) => c.requires.every((id) =>
            states[CONCEPT_IDS.indexOf(id)] === "demonstrated" && !uncertain)
            && !(active && c.contradictedBy?.includes("recursion_runs_forever")));
          expect(result.earnedCriteria).toEqual(expectedEarned.map((c) => c.id));
          expect(result.points).toBe(expectedEarned.reduce((sum, c) => sum + c.points, 0));
          const relevant = active && question.relevantMisconceptions.includes("recursion_runs_forever");
          expect(result.outcome).toBe(relevant ? "misconception" : expectedEarned.length === question.criteria.length ? "correct" : expectedEarned.length ? "partial" : "unsure");
          const selected = question.fragments.filter((f) => result.fragmentIds.includes(f.id));
          expect(result.answerText).toBe(selected.map((f) => f.text).join(" "));
          expect(new Set(result.fragmentIds).size).toBe(result.fragmentIds.length);
          expect(selected.length).toBeGreaterThan(0);
          for (const fragment of question.fragments) {
            const shown = result.fragmentIds.includes(fragment.id);
            if (fragment.kind === "fact") expect(shown).toBe(expectedEarned.some((c) => c.id === fragment.supportsCriterion));
            if (fragment.kind === "context") expect(shown).toBe(fragment.requires.every((r) => !uncertain && ConceptState.options.indexOf(record.concepts[r.concept].state) >= ConceptState.options.indexOf(r.min)));
            if (fragment.kind === "hedge") expect(shown).toBe(record.concepts[fragment.requires[0].concept].state === "partially_taught");
            if (fragment.kind === "misconception") expect(shown).toBe(relevant);
            if (fragment.kind === "uncertain" && shown) expect(selected).toHaveLength(1);
          }
          const expectedBlocking = CONCEPT_IDS.filter((id) => question.criteria.some((c) => !expectedEarned.includes(c) && c.requires.includes(id))
            && (record.concepts[id].state !== "demonstrated" || uncertain));
          expect(result.blocking.concepts).toEqual(expectedBlocking);
          expect(result.blocking.misconceptions).toEqual(relevant ? ["recursion_runs_forever"] : []);
          expect(result.nextStep === null).toBe(expectedBlocking.length === 0 && !relevant);
        }
      }
    }
  });
});

describe("authored teaching probes", () => {
  it("walks concept order then returns null after full coverage", () => {
    const record = recordWith("not_taught");
    for (const id of CONCEPT_IDS) {
      expect(selectProbe(record)?.id).toBe(id);
      record.concepts[id].state = "demonstrated";
    }
    expect(selectProbe(record)).toBeNull();
  });
  it("asks again about partial or uncertain coverage", () => {
    const record = recordWith("demonstrated");
    record.concepts.base_case.state = "partially_taught";
    expect(selectProbe(record)).toEqual({ id: "base_case", text: "How does it know when to stop?" });
    record.concepts.recursive_call.uncertain = true;
    expect(selectProbe(record)?.id).toBe("recursive_call");
  });
});
