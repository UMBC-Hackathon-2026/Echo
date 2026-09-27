import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import * as schema from "@/lib/db/schema";
import type { DynamicRubric } from "@/lib/contracts/dynamic-rubric";
import { createSessionService } from "@/lib/session/service";
import { NotFoundError } from "@/lib/session/errors";
import { FakeEvaluator } from "@/tests/helpers/fake-evaluator";
import { hasTestDb, makeTestDb } from "@/tests/helpers/test-db";

const rubric: DynamicRubric = {
  topicName: "Energy",
  concepts: [{ id: "light", name: "Light", demonstratedWhen: "Explains energy", partialWhen: "Names light", probe: "Where does energy come from?", examples: [{ explanation: "Light supplies energy.", expectedState: "demonstrated", reason: "Source explained" }] }],
  misconceptions: [],
  questions: [{ id: "light.q1", pairId: "P1", type: "explain", text: "Where does energy come from?", answerKey: { expectedAnswer: "Light supplies energy.", correctCriteria: ["Names light"], misconceptionCriteria: [] } }],
};

describe.skipIf(!hasTestDb)("dynamic session loop (DATABASE_URL_TEST)", () => {
  let pool: Pool;
  let db: ReturnType<typeof makeTestDb>["db"];
  beforeAll(() => { ({ pool, db } = makeTestDb()); });
  afterAll(async () => { await pool.end(); });

  it("teaches, assesses, reviews, reteaches and compares a non-recursion topic", async () => {
    const topicId = randomUUID();
    await db.insert(schema.topics).values({ id: topicId, name: rubric.topicName, rubricData: rubric, status: "ready" });
    try {
      const fake = new FakeEvaluator();
      const service = createSessionService({ db, evaluator: fake });
      const { sessionId, ownerToken } = await service.createSession({ topicId });
      const text = "Light supplies energy.";
      fake.push({ ok: true, model: "fake", latencyMs: 1, attempts: 1, evaluation: {
        sessionId, basedOnTurnIds: ["t2"], reports: [], concepts: { light: { state: "demonstrated", evidence: [{ turn_id: "t2", quote: text, start: 0, end: text.length }], conflicts: [], uncertain: false, reason: "Explained" } },
      } });
      let dto = await service.submitTeaching({ sessionId, ownerToken, text, expectedRevision: 0, idempotencyKey: "teach" });
      expect(fake.lastArgs?.topic.rubricData.concepts[0].id).toBe("light");
      dto = await service.createAttempt({ sessionId, ownerToken, expectedRevision: dto.revision, idempotencyKey: "a1" });
      expect(dto.attempts[0].results[0].question.prompt).toBe(rubric.questions[0].text);
      expect(dto.attempts[0].results[0].review).toBeUndefined();
      dto = await service.completeAttempt({ sessionId, ownerToken, attemptId: dto.attempts[0].id, expectedRevision: dto.revision, idempotencyKey: "c1" });
      expect(dto.attempts[0].results[0].review?.answerKey).toBe(text);
      expect(dto.attempts[0].results[0].review?.guidance).toEqual(["Names light"]);
      dto = await service.beginReteach({ sessionId, ownerToken, questionId: "light.q1", nextStepHint: "Explain energy again.", expectedRevision: dto.revision, idempotencyKey: "r1" });
      dto = await service.createAttempt({ sessionId, ownerToken, expectedRevision: dto.revision, idempotencyKey: "a2" });
      dto = await service.completeAttempt({ sessionId, ownerToken, attemptId: dto.attempts[1].id, expectedRevision: dto.revision, idempotencyKey: "c2" });
      expect(dto.phase).toBe("comparing");
      expect(dto.comparison?.[0].type).toBe("explain");
      expect(dto.comparison?.[0].before.answerText).toBe(text);
    } finally {
      // Only this test's topic and its cascading sessions; never reset shared data.
      await db.delete(schema.topics).where(eq(schema.topics.id, topicId));
    }
  });

  it.each(["pending", "processing", "failed"] as const)("rejects a %s topic before creating a session", async status => {
    const topicId = randomUUID();
    await db.insert(schema.topics).values({ id: topicId, name: "Unavailable", status });
    try {
      const service = createSessionService({ db, evaluator: new FakeEvaluator() });
      await expect(service.createSession({ topicId })).rejects.toBeInstanceOf(NotFoundError);
      expect(await db.select().from(schema.sessions).where(eq(schema.sessions.topicId, topicId))).toHaveLength(0);
    } finally { await db.delete(schema.topics).where(eq(schema.topics.id, topicId)); }
  });
});
