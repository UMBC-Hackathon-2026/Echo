import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { Pool } from "pg";
import * as schema from "@/lib/db/schema";
import { createSessionService, type SessionService } from "@/lib/session/service";
import { ConflictError } from "@/lib/session/errors";
import type { ConceptId, ConceptState } from "@/lib/contracts";
import { FakeEvaluator } from "@/tests/helpers/fake-evaluator";
import { hasTestDb, makeTestDb, okEvaluation } from "@/tests/helpers/test-db";

/**
 * Phase 4 review → reteach → reassess → compare loop (ARCHITECTURE_REVISED §4).
 * Deterministic: FakeEvaluator only, fresh session UUIDs per test (no truncate).
 */
describe.skipIf(!hasTestDb)("phase 4 loop (DATABASE_URL_TEST)", () => {
  let pool: Pool;
  let db: ReturnType<typeof makeTestDb>["db"];
  beforeAll(() => { ({ pool, db } = makeTestDb()); });
  afterAll(async () => { await pool.end().catch(() => {}); });

  const svc = (fake: FakeEvaluator): SessionService => createSessionService({ evaluator: fake, db });

  // Cycle 1 omits the base case, so the seeded belief stays active and P1 fails.
  const CYCLE1: Partial<Record<ConceptId, ConceptState>> = { recursive_call: "demonstrated", smaller_subproblem: "demonstrated" };
  // A correct reteach demonstrates the base case + progress, which resolves the seeded belief.
  const CYCLE2_GOOD: Partial<Record<ConceptId, ConceptState>> = {
    recursive_call: "demonstrated", smaller_subproblem: "demonstrated", base_case: "demonstrated", progress_toward_base_case: "demonstrated",
  };
  // A wrong reteach still fails to demonstrate the base case, so nothing improves.
  const CYCLE2_WRONG: Partial<Record<ConceptId, ConceptState>> = { recursive_call: "demonstrated", smaller_subproblem: "demonstrated" };

  const p1 = <T extends { pairId: string }>(results: T[]): T => results.find((r) => r.pairId === "P1")!;

  /** Runs create → teach(cycle1) → attempt1(Form A) → complete, landing in `reviewing`. */
  async function toReviewing(s: SessionService, fake: FakeEvaluator) {
    const { sessionId, ownerToken } = await s.createSession({});
    fake.push(okEvaluation(sessionId, ["t2"], CYCLE1));
    let st = await s.submitTeaching({ sessionId, ownerToken, text: "it calls itself on a smaller n", expectedRevision: 0, idempotencyKey: "m1" });
    st = await s.createAttempt({ sessionId, ownerToken, expectedRevision: st.revision, idempotencyKey: "a1" });
    const attempt1Id = st.attempts[0].id;
    st = await s.completeAttempt({ sessionId, ownerToken, attemptId: attempt1Id, expectedRevision: st.revision, idempotencyKey: "c1" });
    return { sessionId, ownerToken, attempt1Id, revision: st.revision };
  }

  /** From `reviewing`: reteach → teach(cycle2 states) → attempt2(Form B) → complete, landing in `comparing`. */
  async function reteachAndReassess(
    s: SessionService, fake: FakeEvaluator,
    ctx: { sessionId: string; ownerToken: string; revision: number },
    cycle2: Partial<Record<ConceptId, ConceptState>>,
  ) {
    const { sessionId, ownerToken } = ctx;
    let st = await s.beginReteach({ sessionId, ownerToken, questionId: "rec.A.P1", nextStepHint: "Tell it the stopping condition.", expectedRevision: ctx.revision, idempotencyKey: "rt1" });
    expect(st.phase).toBe("reteaching");
    expect(st.cycle).toBe(2);
    fake.push(okEvaluation(sessionId, ["t2", "t5"], cycle2));
    st = await s.submitTeaching({ sessionId, ownerToken, text: "at n === 0 it returns without calling again", expectedRevision: st.revision, idempotencyKey: "m2" });
    expect(st.phase).toBe("reteaching"); // teaching keeps the reteaching phase (§4)
    st = await s.createAttempt({ sessionId, ownerToken, expectedRevision: st.revision, idempotencyKey: "a2" });
    expect(st.phase).toBe("reassessing");
    const attempt2 = st.attempts.find((a) => a.attemptNo === 2)!;
    expect(attempt2.formId).toBe("dynamic.B");
    st = await s.completeAttempt({ sessionId, ownerToken, attemptId: attempt2.id, expectedRevision: st.revision, idempotencyKey: "c2" });
    expect(st.phase).toBe("comparing");
    return st;
  }

  it("walks the full phase sequence and 409s every out-of-order action", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const { sessionId, ownerToken } = await s.createSession({});

    // teaching: attempt-complete / reteach / comparison are all out of order.
    await expect(s.completeAttempt({ sessionId, ownerToken, attemptId: "00000000-0000-0000-0000-000000000000", expectedRevision: 0, idempotencyKey: "x" })).rejects.toBeInstanceOf(ConflictError);
    await expect(s.beginReteach({ sessionId, ownerToken, questionId: "q", nextStepHint: "h", expectedRevision: 0, idempotencyKey: "x" })).rejects.toBeInstanceOf(ConflictError);
    await expect(s.getComparison({ sessionId, ownerToken })).rejects.toBeInstanceOf(ConflictError);

    fake.push(okEvaluation(sessionId, ["t2"], CYCLE1));
    let st = await s.submitTeaching({ sessionId, ownerToken, text: "calls itself on smaller n", expectedRevision: 0, idempotencyKey: "m1" });
    st = await s.createAttempt({ sessionId, ownerToken, expectedRevision: st.revision, idempotencyKey: "a1" });
    expect(st.phase).toBe("assessing");
    const attempt1Id = st.attempts[0].id;

    // assessing: teach / new attempt / reteach / comparison are out of order.
    await expect(s.submitTeaching({ sessionId, ownerToken, text: "x", expectedRevision: st.revision, idempotencyKey: "m2" })).rejects.toBeInstanceOf(ConflictError);
    await expect(s.createAttempt({ sessionId, ownerToken, expectedRevision: st.revision, idempotencyKey: "a2" })).rejects.toBeInstanceOf(ConflictError);
    await expect(s.beginReteach({ sessionId, ownerToken, questionId: "q", nextStepHint: "h", expectedRevision: st.revision, idempotencyKey: "rt" })).rejects.toBeInstanceOf(ConflictError);
    await expect(s.getComparison({ sessionId, ownerToken })).rejects.toBeInstanceOf(ConflictError);

    st = await s.completeAttempt({ sessionId, ownerToken, attemptId: attempt1Id, expectedRevision: st.revision, idempotencyKey: "c1" });
    expect(st.phase).toBe("reviewing");

    // reviewing: teach / attempt / complete-again / comparison are out of order.
    await expect(s.submitTeaching({ sessionId, ownerToken, text: "x", expectedRevision: st.revision, idempotencyKey: "m3" })).rejects.toBeInstanceOf(ConflictError);
    await expect(s.createAttempt({ sessionId, ownerToken, expectedRevision: st.revision, idempotencyKey: "a3" })).rejects.toBeInstanceOf(ConflictError);
    await expect(s.completeAttempt({ sessionId, ownerToken, attemptId: attempt1Id, expectedRevision: st.revision, idempotencyKey: "c1b" })).rejects.toBeInstanceOf(ConflictError);
    await expect(s.getComparison({ sessionId, ownerToken })).rejects.toBeInstanceOf(ConflictError);

    st = await s.beginReteach({ sessionId, ownerToken, questionId: "rec.A.P1", nextStepHint: "stop at 0", expectedRevision: st.revision, idempotencyKey: "rt1" });
    expect(st.phase).toBe("reteaching");

    // reteaching: a second reteach and a complete are out of order (teaching IS allowed here).
    await expect(s.beginReteach({ sessionId, ownerToken, questionId: "q", nextStepHint: "h", expectedRevision: st.revision, idempotencyKey: "rt2" })).rejects.toBeInstanceOf(ConflictError);
    await expect(s.completeAttempt({ sessionId, ownerToken, attemptId: attempt1Id, expectedRevision: st.revision, idempotencyKey: "c2x" })).rejects.toBeInstanceOf(ConflictError);

    fake.push(okEvaluation(sessionId, ["t2", "t5"], CYCLE2_GOOD));
    st = await s.submitTeaching({ sessionId, ownerToken, text: "at n===0 it returns", expectedRevision: st.revision, idempotencyKey: "m4" });
    expect(st.phase).toBe("reteaching");
    st = await s.createAttempt({ sessionId, ownerToken, expectedRevision: st.revision, idempotencyKey: "a4" });
    expect(st.phase).toBe("reassessing");
    const attempt2Id = st.attempts.find((a) => a.attemptNo === 2)!.id;
    st = await s.completeAttempt({ sessionId, ownerToken, attemptId: attempt2Id, expectedRevision: st.revision, idempotencyKey: "c2" });
    expect(st.phase).toBe("comparing");

    // comparing: everything except reading the comparison is out of order.
    await expect(s.submitTeaching({ sessionId, ownerToken, text: "x", expectedRevision: st.revision, idempotencyKey: "m5" })).rejects.toBeInstanceOf(ConflictError);
    await expect(s.createAttempt({ sessionId, ownerToken, expectedRevision: st.revision, idempotencyKey: "a5" })).rejects.toBeInstanceOf(ConflictError);
    await expect(s.beginReteach({ sessionId, ownerToken, questionId: "q", nextStepHint: "h", expectedRevision: st.revision, idempotencyKey: "rt3" })).rejects.toBeInstanceOf(ConflictError);
    await expect(s.completeAttempt({ sessionId, ownerToken, attemptId: attempt2Id, expectedRevision: st.revision, idempotencyKey: "c3" })).rejects.toBeInstanceOf(ConflictError);
    expect((await s.getComparison({ sessionId, ownerToken })).length).toBeGreaterThan(0);
  });

  it("improves P1 from 0 of 2 to 2 of 2 and resolves the seeded belief after a correct reteach", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const ctx = await toReviewing(s, fake);

    const before = await s.getSessionState({ sessionId: ctx.sessionId, ownerToken: ctx.ownerToken });
    const p1Before = p1(before.attempts[0].results);
    expect(p1Before.outcome).toBe("misconception");
    expect(p1Before.points).toBe(0);
    expect(p1Before.maxPoints).toBe(2);

    await reteachAndReassess(s, fake, ctx, CYCLE2_GOOD);
    const rows = await s.getComparison({ sessionId: ctx.sessionId, ownerToken: ctx.ownerToken });
    const row = rows.find((r) => r.pairId === "P1")!;
    expect(row.before.points).toBe(0);
    expect(row.after.points).toBe(2);
    expect(row.after.outcome).toBe("correct");
    expect(row.conceptsBefore.base_case).toBe("not_taught");
    expect(row.conceptsAfter.base_case).toBe("demonstrated");

    // Seeded belief: active before the reteach, resolved after it (never attributed to the student).
    const final = await s.getSessionState({ sessionId: ctx.sessionId, ownerToken: ctx.ownerToken });
    const seeded = final.record.misconceptions["recursion_runs_forever"];
    expect(seeded.origin).toBe("seeded");
    expect(seeded.status).toBe("resolved");
  });

  it("does not falsely improve P1 after a wrong reteach", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const ctx = await toReviewing(s, fake);
    await reteachAndReassess(s, fake, ctx, CYCLE2_WRONG);

    const rows = await s.getComparison({ sessionId: ctx.sessionId, ownerToken: ctx.ownerToken });
    const row = rows.find((r) => r.pairId === "P1")!;
    expect(row.before.points).toBe(0);
    expect(row.after.points).toBe(0); // no false improvement
    expect(row.conceptsBefore.base_case).toBe("not_taught");
    expect(row.conceptsAfter.base_case).toBe("not_taught");

    const final = await s.getSessionState({ sessionId: ctx.sessionId, ownerToken: ctx.ownerToken });
    expect(final.record.misconceptions["recursion_runs_forever"].status).toBe("active"); // belief unresolved
  });

  it("keeps attempt 1 byte-identical across the reteach and attempt 2", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const ctx = await toReviewing(s, fake);
    const reviewing = await s.getSessionState({ sessionId: ctx.sessionId, ownerToken: ctx.ownerToken });
    const attempt1Snapshot = JSON.stringify(reviewing.attempts[0]);

    await reteachAndReassess(s, fake, ctx, CYCLE2_GOOD);
    const comparing = await s.getSessionState({ sessionId: ctx.sessionId, ownerToken: ctx.ownerToken });
    expect(comparing.attempts).toHaveLength(2);
    expect(JSON.stringify(comparing.attempts[0])).toBe(attempt1Snapshot);
  });

  it("reads the comparison from the two pinned records, not the latest record", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const ctx = await toReviewing(s, fake);
    await reteachAndReassess(s, fake, ctx, CYCLE2_GOOD);

    // Simulate later drift: insert a NEWER all-demonstrated record directly. Teaching is
    // blocked by 409 in `comparing`, so this can only happen out-of-band — the comparison
    // must still reflect the pinned attempt records, not this latest one.
    await expect(s.submitTeaching({ sessionId: ctx.sessionId, ownerToken: ctx.ownerToken, text: "extra", expectedRevision: 999, idempotencyKey: "late" })).rejects.toBeInstanceOf(ConflictError);

    const latest = (await db.select().from(schema.learningRecords)
      .where(eq(schema.learningRecords.sessionId, ctx.sessionId))
      .orderBy(desc(schema.learningRecords.version)).limit(1))[0];
    const drifted = structuredClone(latest.record) as { version: number; concepts: Record<string, { state: string }> };
    drifted.version = latest.version + 1;
    for (const k of Object.keys(drifted.concepts)) drifted.concepts[k].state = "demonstrated";
    await db.insert(schema.learningRecords).values({
      id: randomUUID(), sessionId: ctx.sessionId, version: latest.version + 1, cycle: 2,
      record: drifted, rubricVersion: latest.rubricVersion, validatorVersion: latest.validatorVersion,
    });

    const state = await s.getSessionState({ sessionId: ctx.sessionId, ownerToken: ctx.ownerToken });
    expect(state.record.version).toBe(latest.version + 1); // latest is the drifted record
    const row = state.comparison!.find((r) => r.pairId === "P1")!;
    expect(row.conceptsBefore.base_case).toBe("not_taught");   // still the attempt-1 pinned record
    expect(row.conceptsAfter.base_case).toBe("demonstrated");  // still the attempt-2 pinned record
    expect(row.before.points).toBe(0);
    expect(row.after.points).toBe(2);
  });
});
