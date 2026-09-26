import { describe, expect, it } from "vitest";
import { LearningRecord } from "@/lib/contracts";
import { createInitialRecord, createLearningRecord } from "@/lib/learner/record";
import { updateMisconceptions } from "@/lib/learner/misconceptions";
import { validateEvaluation, type VerifiedMisconceptionReport } from "@/lib/evaluator/validate";
import { assessQuestion } from "@/lib/learner/gate";
import { FORMS } from "@/lib/content/recursion/forms";
import { proposal, recordWith, turn } from "./helpers/phase2";

const belief = "recursion_runs_forever";
function report(stance: "asserted" | "retracted", number: number): VerifiedMisconceptionReport {
  const quote = stance === "asserted" ? "recursion never stops" : "I retract that";
  return { id: belief, stance, evidence: [{ turn_id: `t${number}`, start: 0, end: quote.length, quote }] };
}

describe("seeded and student misconception lifecycle", () => {
  it("starts v0 with five untaught concepts and an unattributed active seed", () => {
    const { record, events } = createInitialRecord({ id: "r0", sessionId: "session" });
    expect(LearningRecord.safeParse(record).success).toBe(true);
    expect(Object.values(record.concepts).every((c) => c.state === "not_taught")).toBe(true);
    expect(record.misconceptions[belief]).toEqual({ origin: "seeded", status: "active", evidence: [], changed_in_version: 0 });
    expect(events).toEqual([{ misconception_id: belief, origin: "seeded", event: "activated", evidence: [], changed_in_version: 0 }]);
    expect(Object.isFrozen(record.concepts.base_case)).toBe(true);
  });

  it("resolves and reactivates the seed exactly according to the source rule", () => {
    const previous = createInitialRecord({ id: "r0", sessionId: "session" }).record;
    const concepts = recordWith("not_taught").concepts;
    concepts.base_case.state = "demonstrated";
    expect(updateMisconceptions(previous.misconceptions, concepts, [], 1).events).toEqual([]);
    concepts.progress_toward_base_case.state = "partially_taught";
    const resolved = updateMisconceptions(previous.misconceptions, concepts, [], 2);
    expect(resolved.events[0].event).toBe("resolved");
    expect(resolved.misconceptions[belief].changed_in_version).toBe(2);
    const unchanged = updateMisconceptions(resolved.misconceptions, concepts, [], 3);
    expect(unchanged.events).toEqual([]);
    expect(unchanged.misconceptions[belief].changed_in_version).toBe(2);
    concepts.base_case.state = "partially_taught";
    const reactivated = updateMisconceptions(unchanged.misconceptions, concepts, [], 4);
    expect(reactivated.events[0]).toMatchObject({ origin: "seeded", event: "reactivated", evidence: [], changed_in_version: 4 });
    expect(previous.misconceptions[belief].changed_in_version).toBe(0);
  });

  it("keeps a student's assertion separate even when it names the seeded misconception", () => {
    const concepts = recordWith("demonstrated").concepts;
    const result = updateMisconceptions({}, concepts, [report("asserted", 1)], 1);
    expect(result.misconceptions[belief]).toMatchObject({ origin: "seeded", status: "resolved", evidence: [] });
    expect(result.misconceptions[`student:${belief}`]).toMatchObject({ origin: "student", status: "active", evidence: report("asserted", 1).evidence });
  });

  it("only accepts later retractions, preserves status on omissions, and reactivates later assertions", () => {
    const concepts = recordWith("demonstrated").concepts;
    const first = updateMisconceptions({}, concepts, [report("asserted", 2)], 1);
    const invalid = updateMisconceptions(first.misconceptions, concepts, [report("retracted", 1), report("retracted", 2)], 2);
    expect(invalid.misconceptions[`student:${belief}`].status).toBe("active");
    expect(invalid.events).toEqual([]);
    const resolved = updateMisconceptions(invalid.misconceptions, concepts, [report("retracted", 10)], 3);
    expect(resolved.events).toMatchObject([{ origin: "student", event: "resolved", changed_in_version: 3 }]);
    const replay = updateMisconceptions(resolved.misconceptions, concepts, [report("asserted", 2), report("retracted", 10)], 4);
    expect(replay.events).toEqual([]);
    const omitted = updateMisconceptions(replay.misconceptions, concepts, [], 5);
    expect(omitted.misconceptions[`student:${belief}`].changed_in_version).toBe(3);
    const reactivated = updateMisconceptions(omitted.misconceptions, concepts, [report("asserted", 11)], 6);
    expect(reactivated.events[0]).toMatchObject({ origin: "student", event: "reactivated", changed_in_version: 6 });
  });

  it("orders shuffled reports numerically, records every transition, and treats same-turn contradictions conservatively", () => {
    const concepts = recordWith("demonstrated").concepts;
    const result = updateMisconceptions({}, concepts, [report("asserted", 11), report("retracted", 10), report("asserted", 2)], 1);
    expect(result.events.filter((e) => e.origin === "student").map((e) => e.event)).toEqual(["activated", "resolved", "reactivated"]);
    const conflict = updateMisconceptions({}, concepts, [report("asserted", 2), report("retracted", 3), report("asserted", 3)], 1);
    expect(conflict.misconceptions[`student:${belief}`].status).toBe("active");
  });

  it("ignores ungrounded reports and standalone retractions", () => {
    const result = updateMisconceptions({}, recordWith("not_taught").concepts, [report("retracted", 2), { ...report("asserted", 3), evidence: [] }], 1);
    expect(result.misconceptions[`student:${belief}`]).toBeUndefined();
    expect(() => updateMisconceptions({}, recordWith("not_taught").concepts, [{ ...report("asserted", 3), id: "unknown" }], 1)).toThrow();
  });
});

describe("immutable record revisions and wrong reteaching", () => {
  it("recomputes snapshots, preserves history, and leaves a prior assessment unchanged after wrong reteaching", () => {
    const initial = createInitialRecord({ id: "r0", sessionId: "session" }).record;
    const text = "It stops at zero.";
    const raw = proposal("base_case", text);
    raw.concepts.push({ ...proposal("progress_toward_base_case", text).concepts[0], state: "partially_taught" });
    const evaluation = validateEvaluation(raw, { sessionId: "session", turns: [turn("t1", text)] });
    const first = createLearningRecord({ id: "r1", cycle: 1, previous: initial, evaluation });
    const question = FORMS[0].questions[0];
    const before = assessQuestion(first.record, question);
    const saved = JSON.stringify(first);
    raw.concepts[0].conflicts = [{ turn_id: "t2", quote: "Actually it never stops" }];
    raw.concepts[0].resolution = "unresolved";
    const later = validateEvaluation(raw, { sessionId: "session", turns: [turn("t1", text), turn("t2", "Actually it never stops")] });
    const second = createLearningRecord({ id: "r2", cycle: 2, previous: first.record, evaluation: later });
    expect(second.record).toMatchObject({ version: 2, cycle: 2, based_on_turn_ids: ["t1", "t2"] });
    expect(second.record.misconceptions[belief].status).toBe("active");
    expect(assessQuestion(second.record, question).points).toBeLessThan(before.points);
    expect(assessQuestion(first.record, question)).toEqual(before);
    expect(JSON.stringify(first)).toBe(saved);
    evaluation.concepts.base_case.reason = "caller mutation";
    expect(first.record.concepts.base_case.reason).not.toBe("caller mutation");
    expect(Object.isFrozen(second.record.concepts.base_case.evidence)).toBe(true);
  });

  it("rejects cross-session snapshots, repeated record IDs, backward cycles, and omitted earlier turns", () => {
    const initial = createInitialRecord({ id: "r0", sessionId: "session" }).record;
    const evaluation = validateEvaluation(proposal(), { sessionId: "session", turns: [turn("t1", "It stops at zero.")] });
    expect(() => createLearningRecord({ id: "r0", cycle: 1, previous: initial, evaluation })).toThrow();
    expect(() => createLearningRecord({ id: "r1", cycle: 1, previous: initial, evaluation: { ...evaluation, sessionId: "other" } })).toThrow();
    const first = createLearningRecord({ id: "r1", cycle: 2, previous: initial, evaluation }).record;
    expect(() => createLearningRecord({ id: "r2", cycle: 1, previous: first, evaluation })).toThrow();
    expect(() => createLearningRecord({ id: "r2", cycle: 2, previous: first, evaluation: { ...evaluation, basedOnTurnIds: [] } })).toThrow();
  });
});
