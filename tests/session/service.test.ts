import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Pool } from "pg";
import * as schema from "@/lib/db/schema";
import { createSessionService, type SessionService } from "@/lib/session/service";
import { ConflictError, IdempotencyMismatchError, NotFoundError } from "@/lib/session/errors";
import { FakeEvaluator } from "@/tests/helpers/fake-evaluator";
import { hasTestDb, makeTestDb, okEvaluation } from "@/tests/helpers/test-db";

describe.skipIf(!hasTestDb)("session service (DATABASE_URL_TEST)", () => {
  let pool: Pool;
  let db: ReturnType<typeof makeTestDb>["db"];
  beforeAll(() => { ({ pool, db } = makeTestDb()); });
  afterAll(async () => { await pool.end().catch(() => {}); });
  // No global truncate: each test uses fresh session UUIDs, so tests self-isolate
  // and cannot race the parallel routes suite on the shared test DB.

  const svc = (fake: FakeEvaluator): SessionService => createSessionService({ evaluator: fake, db });

  it("creates a session with v0 record and an opening learner line", async () => {
    const { dto } = await svc(new FakeEvaluator()).createSession({});
    expect(dto.record.version).toBe(0);
    expect(dto.messages).toHaveLength(1);
    expect(dto.messages[0].role).toBe("learner");
    expect(dto.phase).toBe("teaching");
  });

  // Gate 5 — idempotency
  it("teaches once, and a duplicate request replays with no new evaluator call", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const { sessionId, ownerToken } = await s.createSession({});
    fake.push(okEvaluation(sessionId, ["t2"], { recursive_call: "demonstrated", smaller_subproblem: "demonstrated" }));
    const body = { sessionId, ownerToken, text: "it calls itself on a smaller n", expectedRevision: 0, idempotencyKey: "k1" };
    const r1 = await s.submitTeaching(body);
    expect(fake.calls).toBe(1);
    expect(r1.record.version).toBe(1);
    const r2 = await s.submitTeaching(body);
    expect(fake.calls).toBe(1);
    expect(r2).toEqual(r1); // deep-equal (jsonb normalizes key order)
    const students = r2.messages.filter((m) => m.role === "student");
    expect(students).toHaveLength(1);
    const recs = await db.select().from(schema.learningRecords).where(eq(schema.learningRecords.sessionId, sessionId));
    expect(recs).toHaveLength(2); // v0 + v1
  });

  it("rejects the same idempotency key with a different body (422)", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const { sessionId, ownerToken } = await s.createSession({});
    fake.push(okEvaluation(sessionId, ["t2"], { recursive_call: "demonstrated" }));
    await s.submitTeaching({ sessionId, ownerToken, text: "first", expectedRevision: 0, idempotencyKey: "dup" });
    await expect(
      s.submitTeaching({ sessionId, ownerToken, text: "different", expectedRevision: 0, idempotencyKey: "dup" }),
    ).rejects.toBeInstanceOf(IdempotencyMismatchError);
  });

  it("createAttempt is idempotent", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const { sessionId, ownerToken } = await s.createSession({});
    fake.push(okEvaluation(sessionId, ["t2"], { base_case: "demonstrated" }));
    const t = await s.submitTeaching({ sessionId, ownerToken, text: "stops at 0", expectedRevision: 0, idempotencyKey: "m1" });
    const a1 = await s.createAttempt({ sessionId, ownerToken, expectedRevision: t.revision, idempotencyKey: "a1" });
    const a2 = await s.createAttempt({ sessionId, ownerToken, expectedRevision: t.revision, idempotencyKey: "a1" });
    expect(a2).toEqual(a1); // deep-equal (jsonb normalizes key order)
    const rows = await db.select().from(schema.assessmentAttempts).where(eq(schema.assessmentAttempts.sessionId, sessionId));
    expect(rows).toHaveLength(1);
  });

  // Gate 8 — ownership
  it("returns not-found for missing, wrong, and another session's token", async () => {
    const s = svc(new FakeEvaluator());
    const { sessionId } = await s.createSession({});
    const other = await s.createSession({});
    for (const token of ["", "deadbeef", other.ownerToken]) {
      await expect(s.getSessionState({ sessionId, ownerToken: token })).rejects.toBeInstanceOf(NotFoundError);
      await expect(s.submitTeaching({ sessionId, ownerToken: token, text: "x", expectedRevision: 0, idempotencyKey: "k" })).rejects.toBeInstanceOf(NotFoundError);
      await expect(s.createAttempt({ sessionId, ownerToken: token, expectedRevision: 0, idempotencyKey: "k" })).rejects.toBeInstanceOf(NotFoundError);
      await expect(s.completeAttempt({ sessionId, ownerToken: token, attemptId: randomUUID(), expectedRevision: 0, idempotencyKey: "k" })).rejects.toBeInstanceOf(NotFoundError);
      await expect(s.retryEvaluation({ sessionId, ownerToken: token, messageId: randomUUID(), expectedRevision: 0 })).rejects.toBeInstanceOf(NotFoundError);
    }
  });

  // Gate 9 — failure paths
  it("preserves text and blocks attempts on evaluator failure; retry then succeeds", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const { sessionId, ownerToken } = await s.createSession({});
    fake.push({
      ok: false,
      reason: "provider_error",
      attempts: 2,
      diagnostic: { stage: "provider", code: "INVALID_ARGUMENT", message: "Request contains an invalid argument.", providerStatus: 400 },
    });
    const r = await s.submitTeaching({ sessionId, ownerToken, text: "my explanation", expectedRevision: 0, idempotencyKey: "m1" });
    const student = r.messages.find((m) => m.role === "student");
    expect(student?.evalStatus).toBe("failed");
    expect(student?.evalError).toBe("provider_error:provider:400:INVALID_ARGUMENT");
    expect(student?.content).toBe("my explanation");
    expect(log).toHaveBeenCalledWith("teach_evaluation_failed", expect.objectContaining({
      operation: "submit", stage: "provider", code: "INVALID_ARGUMENT", reason: "provider_error", providerStatus: 400,
    }));
    expect(JSON.stringify(log.mock.calls)).not.toContain("my explanation");
    expect(r.record.version).toBe(0);
    await expect(s.createAttempt({ sessionId, ownerToken, expectedRevision: r.revision, idempotencyKey: "a1" })).rejects.toBeInstanceOf(ConflictError);

    fake.push(okEvaluation(sessionId, ["t2"], { base_case: "demonstrated", progress_toward_base_case: "demonstrated" }));
    const r2 = await s.retryEvaluation({ sessionId, ownerToken, messageId: student!.id, expectedRevision: r.revision });
    expect(r2.messages.find((m) => m.role === "student")?.evalStatus).toBe("evaluated");
    expect(r2.record.version).toBe(1);
    log.mockRestore();
  });

  // Gate 7 — transitions
  it("allows the Phase 3 transitions and conflicts on the rest", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const { sessionId, ownerToken } = await s.createSession({});
    fake.push(okEvaluation(sessionId, ["t2"], { base_case: "demonstrated" }));
    let st = await s.submitTeaching({ sessionId, ownerToken, text: "stops at 0", expectedRevision: 0, idempotencyKey: "m1" });
    expect(st.phase).toBe("teaching");
    st = await s.createAttempt({ sessionId, ownerToken, expectedRevision: st.revision, idempotencyKey: "a1" });
    expect(st.phase).toBe("assessing");
    const attemptId = st.attempts[0].id;
    await expect(s.submitTeaching({ sessionId, ownerToken, text: "x", expectedRevision: st.revision, idempotencyKey: "m2" })).rejects.toBeInstanceOf(ConflictError);
    await expect(s.createAttempt({ sessionId, ownerToken, expectedRevision: st.revision, idempotencyKey: "a2" })).rejects.toBeInstanceOf(ConflictError);
    st = await s.completeAttempt({ sessionId, ownerToken, attemptId, expectedRevision: st.revision, idempotencyKey: "c1" });
    expect(st.phase).toBe("reviewing");
    await expect(s.submitTeaching({ sessionId, ownerToken, text: "x", expectedRevision: st.revision, idempotencyKey: "m3" })).rejects.toBeInstanceOf(ConflictError);
    await expect(s.createAttempt({ sessionId, ownerToken, expectedRevision: st.revision, idempotencyKey: "a3" })).rejects.toBeInstanceOf(ConflictError);
  });

  // Gate 6 — concurrency
  it("conflicts on a stale revision and while an evaluation is pending", async () => {
    const s = svc(new FakeEvaluator());
    const { sessionId, ownerToken } = await s.createSession({});
    await expect(s.submitTeaching({ sessionId, ownerToken, text: "x", expectedRevision: 99, idempotencyKey: "k1" })).rejects.toBeInstanceOf(ConflictError);
    await db.insert(schema.messages).values({ id: randomUUID(), sessionId, turnNo: 2, role: "student", content: "in flight", inputMode: "typed", cycle: 1, evalStatus: "pending" });
    await expect(s.submitTeaching({ sessionId, ownerToken, text: "y", expectedRevision: 0, idempotencyKey: "k2" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("a stale tx2 (concurrent revision bump) applies nothing", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const { sessionId, ownerToken } = await s.createSession({});
    fake.onEvaluate = async () => {
      await db.update(schema.sessions).set({ revision: sql`${schema.sessions.revision} + 1` }).where(eq(schema.sessions.id, sessionId));
    };
    fake.push(okEvaluation(sessionId, ["t2"], { recursive_call: "demonstrated" }));
    const r = await s.submitTeaching({ sessionId, ownerToken, text: "teach", expectedRevision: 0, idempotencyKey: "k1" });
    expect(r.messages.find((m) => m.role === "student")?.evalStatus).toBe("pending"); // unchanged
    expect(r.record.version).toBe(0);
    const recs = await db.select().from(schema.learningRecords).where(eq(schema.learningRecords.sessionId, sessionId));
    expect(recs).toHaveLength(1);
  });

  // Gate 4 — cross-session integrity
  it("rejects pinning another session's record (service and database)", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const A = await s.createSession({});
    fake.push(okEvaluation(A.sessionId, ["t2"], { base_case: "demonstrated" }));
    const aTaught = await s.submitTeaching({ sessionId: A.sessionId, ownerToken: A.ownerToken, text: "stops at 0", expectedRevision: 0, idempotencyKey: "k" });
    const aRecordId = aTaught.record.id;
    const B = await s.createSession({});
    await expect(
      s.createAttempt({ sessionId: B.sessionId, ownerToken: B.ownerToken, expectedRevision: 0, recordId: aRecordId, idempotencyKey: "k" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      db.insert(schema.assessmentAttempts).values({
        id: randomUUID(), sessionId: B.sessionId, attemptNo: 1, formId: "dynamic.A", formVersion: "x",
        gateVersion: "x", rubricVersion: "x", learningRecordId: aRecordId, status: "in_progress", expectedResults: 4,
      }),
    ).rejects.toThrow();
  });

  // Gate 10 — pinning
  it("pins an explicit earlier record; a later record does not change the attempt", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const { sessionId, ownerToken } = await s.createSession({});
    fake.push(okEvaluation(sessionId, ["t2"], { recursive_call: "demonstrated", smaller_subproblem: "demonstrated" }));
    const v1 = await s.submitTeaching({ sessionId, ownerToken, text: "calls itself on smaller n", expectedRevision: 0, idempotencyKey: "m1" });
    const v1RecordId = v1.record.id;
    fake.push(okEvaluation(sessionId, ["t2", "t4"], { recursive_call: "demonstrated", smaller_subproblem: "demonstrated", base_case: "demonstrated", progress_toward_base_case: "demonstrated" }));
    const v2 = await s.submitTeaching({ sessionId, ownerToken, text: "stops at n===0", expectedRevision: v1.revision, idempotencyKey: "m2" });
    expect(v2.record.version).toBe(2);
    const att = await s.createAttempt({ sessionId, ownerToken, expectedRevision: v2.revision, recordId: v1RecordId, idempotencyKey: "a1" });
    const rows = await db.select().from(schema.assessmentAttempts).where(eq(schema.assessmentAttempts.sessionId, sessionId));
    expect(rows[0].learningRecordId).toBe(v1RecordId);
    const p1 = att.attempts[0].results.find((r) => r.questionId === "dyn.A.P1");
    expect(p1?.outcome).not.toBe("correct"); // base_case not demonstrated in v1
    const again = await s.getSessionState({ sessionId, ownerToken });
    expect(JSON.stringify(again.attempts[0])).toBe(JSON.stringify(att.attempts[0]));
  });

  // Gate 11 — completion
  it("completeAttempt fails with a missing result row and succeeds when all present", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const { sessionId, ownerToken } = await s.createSession({});
    fake.push(okEvaluation(sessionId, ["t2"], { base_case: "demonstrated" }));
    const t = await s.submitTeaching({ sessionId, ownerToken, text: "stops at 0", expectedRevision: 0, idempotencyKey: "m1" });
    const att = await s.createAttempt({ sessionId, ownerToken, expectedRevision: t.revision, idempotencyKey: "a1" });
    const attemptId = att.attempts[0].id;
    await db.delete(schema.questionResults).where(and(eq(schema.questionResults.attemptId, attemptId), eq(schema.questionResults.questionId, "dyn.A.P1")));
    await expect(s.completeAttempt({ sessionId, ownerToken, attemptId, expectedRevision: att.revision, idempotencyKey: "c1" })).rejects.toBeInstanceOf(ConflictError);
  });

  // Gate 12 — DTO leakage at the service boundary
  it("does not expose answer keys before completion", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const { sessionId, ownerToken } = await s.createSession({});
    fake.push(okEvaluation(sessionId, ["t2"], { base_case: "demonstrated" }));
    const t = await s.submitTeaching({ sessionId, ownerToken, text: "stops at 0", expectedRevision: 0, idempotencyKey: "m1" });
    const att = await s.createAttempt({ sessionId, ownerToken, expectedRevision: t.revision, idempotencyKey: "a1" });
    expect(att.attempts[0].status).toBe("in_progress");
    expect(att.attempts[0].results[0].review).toBeUndefined();
    expect(JSON.stringify(att)).not.toContain("answerKey");
    expect(JSON.stringify(att)).not.toContain("supportsCriterion");
  });
});
