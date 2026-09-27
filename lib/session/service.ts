import "server-only";
import { randomBytes, randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { SessionDTO, ComparisonRowDTO, ConceptId, ConceptState } from "@/lib/contracts";
import { getDb, type Db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import * as repo from "@/lib/db/repository";
import type { Executor } from "@/lib/db/repository";
import { createInitialRecord, createLearningRecord } from "@/lib/learner/record";
import { selectProbe } from "@/lib/learner/probe";
import { assessQuestion, GATE_VERSION } from "@/lib/learner/gate";
import { getForm } from "@/lib/content/recursion/forms";
import { RUBRIC_VERSION } from "@/lib/content/recursion/rubric";
import { VALIDATOR_VERSION } from "@/lib/evaluator/validate";
import { RECURSION_RUNS_FOREVER } from "@/lib/content/recursion/misconceptions";
import type { Evaluator } from "@/lib/evaluator/evaluator";
import { toSessionDTO } from "./dto";
import { ConflictError, IdempotencyMismatchError, InvalidInputError, NotFoundError } from "./errors";

const TURN_CAP = 30;
const MAX_TEXT = 2000;

function newOwnerToken(): string {
  return randomBytes(32).toString("hex");
}
function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}
function tokenMatches(token: string, stored: Buffer): boolean {
  const h = hashToken(token);
  return h.length === stored.length && timingSafeEqual(h, stored);
}
function hashRequest(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

function assertOwner(session: { ownerTokenHash: Buffer }, token: string): void {
  if (!tokenMatches(token, session.ownerTokenHash)) throw new NotFoundError();
}

async function persistEvents(
  exec: Executor,
  sessionId: string,
  recordId: string,
  events: { misconception_id: string; origin: "seeded" | "student"; event: "activated" | "resolved" | "reactivated"; evidence: unknown[] }[],
): Promise<void> {
  for (const e of events) {
    await exec.insert(schema.misconceptionEvents).values({
      sessionId,
      learningRecordId: recordId,
      misconceptionId: e.misconception_id,
      origin: e.origin,
      event: e.event,
      evidence: e.evidence,
    });
  }
}

export interface SessionService {
  createSession(input: { topicId?: string }): Promise<{ sessionId: string; ownerToken: string; dto: SessionDTO }>;
  submitTeaching(input: SubmitTeachingInput): Promise<SessionDTO>;
  retryEvaluation(input: { sessionId: string; ownerToken: string; messageId: string; expectedRevision: number }): Promise<SessionDTO>;
  createAttempt(input: CreateAttemptInput): Promise<SessionDTO>;
  completeAttempt(input: { sessionId: string; ownerToken: string; attemptId: string; expectedRevision: number; idempotencyKey: string }): Promise<SessionDTO>;
  beginReteach(input: { sessionId: string; ownerToken: string; questionId: string; nextStepHint: string; expectedRevision: number; idempotencyKey: string }): Promise<SessionDTO>;
  getComparison(input: { sessionId: string; ownerToken: string }): Promise<ComparisonRowDTO[]>;
  getSessionState(input: { sessionId: string; ownerToken: string }): Promise<SessionDTO>;
}

export interface SubmitTeachingInput {
  sessionId: string;
  ownerToken: string;
  text: string;
  inputMode?: "typed" | "voice";
  expectedRevision: number;
  idempotencyKey: string;
}

export interface CreateAttemptInput {
  sessionId: string;
  ownerToken: string;
  expectedRevision: number;
  recordId?: string;
  idempotencyKey: string;
}

export function createSessionService(opts: { evaluator: Evaluator; db?: Db }): SessionService {
  const db = opts.db ?? getDb();
  const evaluator = opts.evaluator;

  async function buildDTO(exec: Executor, sessionId: string): Promise<SessionDTO> {
    const session = await repo.getSession(exec, sessionId);
    if (!session) throw new NotFoundError();
    const record = await repo.getLatestRecord(exec, sessionId);
    if (!record) throw new NotFoundError("record missing");
    const [messages, attempts] = await Promise.all([
      repo.getMessages(exec, sessionId),
      repo.getAttemptsWithResults(exec, sessionId),
    ]);
    const dto = toSessionDTO({ sessionId, phase: session.phase, revision: session.revision, cycle: session.cycle, messages, record, attempts });
    if (session.phase === "comparing" && attempts.length === 2) {
      const [a1, a2] = attempts;
      const c1 = a1.pinnedRecord.concepts;
      const c2 = a2.pinnedRecord.concepts;
      const map1 = new Map(a1.results.map((r) => [r.result.pairId, r]));
      dto.comparison = a2.results.map((r2) => {
        const r1 = map1.get(r2.result.pairId);
        if (!r1) throw new Error(`Missing matching pairId ${r2.result.pairId}`);
        const conceptsBefore = {} as Record<ConceptId, ConceptState>;
        const conceptsAfter = {} as Record<ConceptId, ConceptState>;
        for (const k of Object.keys(c1)) {
           const cid = k as ConceptId;
           conceptsBefore[cid] = c1[cid].state;
           conceptsAfter[cid] = c2[cid].state;
        }
        return {
          pairId: r2.result.pairId,
          type: r2.question.type,
          before: { outcome: r1.result.outcome, points: r1.result.points, maxPoints: r1.result.maxPoints, answerText: r1.result.answerText },
          after: { outcome: r2.result.outcome, points: r2.result.points, maxPoints: r2.result.maxPoints, answerText: r2.result.answerText },
          conceptsBefore,
          conceptsAfter,
        };
      });
    }
    return dto;
  }

  async function loadOwned(exec: Executor, sessionId: string, token: string) {
    const session = await repo.getSessionForUpdate(exec, sessionId);
    if (!session) throw new NotFoundError();
    assertOwner(session, token);
    return session;
  }

  return {
    async createSession({ topicId = "recursion" }) {
      const token = newOwnerToken();
      const sessionId = randomUUID();
      const recordId = randomUUID();
      const { record, events } = createInitialRecord({ id: recordId, sessionId });
      await db.transaction(async (tx) => {
        await tx.insert(schema.sessions).values({
          id: sessionId,
          ownerTokenHash: hashToken(token),
          topicId,
          rubricVersion: RUBRIC_VERSION,
          phase: "teaching",
          cycle: 1,
          revision: 0,
        });
        await tx.insert(schema.learningRecords).values({
          id: recordId,
          sessionId,
          version: 0,
          cycle: 1,
          record: record,
          rubricVersion: RUBRIC_VERSION,
          validatorVersion: VALIDATOR_VERSION,
        });
        await persistEvents(tx, sessionId, recordId, events);
        await tx.insert(schema.messages).values({
          id: randomUUID(),
          sessionId,
          turnNo: 1,
          role: "learner",
          content: RECURSION_RUNS_FOREVER.openingLine,
          inputMode: "typed",
          cycle: 1,
          evalStatus: "not_applicable",
        });
      });
      const dto = await buildDTO(db, sessionId);
      return { sessionId, ownerToken: token, dto };
    },

    async submitTeaching(input) {
      const { sessionId, ownerToken, text, inputMode = "typed", expectedRevision, idempotencyKey } = input;
      if (text.length < 1 || text.length > MAX_TEXT) throw new InvalidInputError("text must be 1..2000 chars");
      const route = "messages";
      const requestHash = hashRequest({ text, inputMode, expectedRevision });

      // tx1: validate, insert pending student turn, bump revision (or replay).
      let replay: SessionDTO | undefined;
      let tx1: { messageId: string; revAfter1: number } | undefined;
      await db.transaction(async (tx) => {
        const s = await loadOwned(tx, sessionId, ownerToken);
        const idem = await repo.getIdempotency(tx, { sessionId, route, key: idempotencyKey, requestHash });
        if (idem.kind === "stored") { replay = idem.response as SessionDTO; return; }
        if (idem.kind === "mismatch") throw new IdempotencyMismatchError();
        if (s.phase !== "teaching") throw new ConflictError(s.phase, s.revision, "not in teaching phase");
        if (s.revision !== expectedRevision) throw new ConflictError(s.phase, s.revision, "revision mismatch");
        if ((await repo.countPendingEvaluations(tx, sessionId)) > 0) throw new ConflictError(s.phase, s.revision, "evaluation pending");
        const turnNo = await repo.nextTurnNo(tx, sessionId);
        if (turnNo > TURN_CAP) throw new InvalidInputError("turn cap reached");
        const messageId = randomUUID();
        await tx.insert(schema.messages).values({
          id: messageId, sessionId, turnNo, role: "student", content: text, inputMode, cycle: s.cycle, evalStatus: "pending",
        });
        const revAfter1 = s.revision + 1;
        await tx.update(schema.sessions).set({ revision: revAfter1, updatedAt: new Date() }).where(eq(schema.sessions.id, sessionId));
        tx1 = { messageId, revAfter1 };
      });
      if (replay) return replay;
      if (!tx1) throw new ConflictError("teaching", expectedRevision, "teach not started");
      const { messageId: pendingMessageId, revAfter1 } = tx1;

      // Gemini call — NO transaction open.
      const turns = await repo.getStudentTurns(db, sessionId);
      const result = await evaluator.evaluate({ sessionId, turns });

      if (!result.ok) {
        await db.transaction(async (tx) => {
          await tx.update(schema.messages)
            .set({ evalStatus: "failed", evalError: result.reason })
            .where(and(eq(schema.messages.id, pendingMessageId), eq(schema.messages.evalStatus, "pending")));
        });
        const dto = await buildDTO(db, sessionId);
        await db.transaction((tx) => repo.putIdempotency(tx, { sessionId, route, key: idempotencyKey, requestHash, response: dto }));
        return dto;
      }

      // tx2: apply iff still current.
      await db.transaction(async (tx) => {
        const s = await repo.getSessionForUpdate(tx, sessionId);
        if (!s) throw new NotFoundError();
        const msgs = await tx.select().from(schema.messages).where(eq(schema.messages.id, pendingMessageId)).limit(1);
        const msg = msgs[0];
        if (s.revision !== revAfter1 || !msg || msg.evalStatus !== "pending") return; // stale: change nothing
        const previous = await repo.getLatestRecord(tx, sessionId);
        if (!previous) throw new NotFoundError("previous record missing");
        const newRecordId = randomUUID();
        const { record, events } = createLearningRecord({ id: newRecordId, cycle: s.cycle, previous, evaluation: result.evaluation });
        await tx.insert(schema.learningRecords).values({
          id: newRecordId, sessionId, version: record.version, cycle: record.cycle,
          record: record,
          rubricVersion: RUBRIC_VERSION, validatorVersion: VALIDATOR_VERSION, evaluatorModel: result.model, sourceMessageId: pendingMessageId,
        });
        await persistEvents(tx, sessionId, newRecordId, events);
        const probe = selectProbe(record);
        if (probe) {
          const probeTurn = await repo.nextTurnNo(tx, sessionId);
          await tx.insert(schema.messages).values({
            id: randomUUID(), sessionId, turnNo: probeTurn, role: "learner", content: probe.text, inputMode: "typed", cycle: s.cycle, evalStatus: "not_applicable", probeId: probe.id,
          });
        }
        await tx.update(schema.messages).set({ evalStatus: "evaluated" }).where(eq(schema.messages.id, pendingMessageId));
        await tx.update(schema.sessions).set({ revision: s.revision + 1, updatedAt: new Date() }).where(eq(schema.sessions.id, sessionId));
      });

      const dto = await buildDTO(db, sessionId);
      await db.transaction((tx) => repo.putIdempotency(tx, { sessionId, route, key: idempotencyKey, requestHash, response: dto }));
      return dto;
    },

    async retryEvaluation({ sessionId, ownerToken, messageId, expectedRevision }) {
      const tx1 = await db.transaction(async (tx) => {
        const s = await loadOwned(tx, sessionId, ownerToken);
        if (s.phase !== "teaching") throw new ConflictError(s.phase, s.revision, "not in teaching phase");
        if (s.revision !== expectedRevision) throw new ConflictError(s.phase, s.revision, "revision mismatch");
        if ((await repo.countPendingEvaluations(tx, sessionId)) > 0) throw new ConflictError(s.phase, s.revision, "evaluation pending");
        const msgs = await tx.select().from(schema.messages)
          .where(and(eq(schema.messages.id, messageId), eq(schema.messages.sessionId, sessionId))).limit(1);
        const msg = msgs[0];
        if (!msg || msg.role !== "student") throw new NotFoundError("message not found");
        if (msg.evalStatus !== "failed") throw new ConflictError(s.phase, s.revision, "message is not failed");
        await tx.update(schema.messages).set({ evalStatus: "pending", evalError: null }).where(eq(schema.messages.id, messageId));
        const revAfter1 = s.revision + 1;
        await tx.update(schema.sessions).set({ revision: revAfter1, updatedAt: new Date() }).where(eq(schema.sessions.id, sessionId));
        return { revAfter1, cycle: s.cycle };
      });

      const turns = await repo.getStudentTurns(db, sessionId);
      const result = await evaluator.evaluate({ sessionId, turns });
      if (!result.ok) {
        await db.transaction((tx) =>
          tx.update(schema.messages).set({ evalStatus: "failed", evalError: result.reason }).where(eq(schema.messages.id, messageId)));
        return buildDTO(db, sessionId);
      }
      await db.transaction(async (tx) => {
        const s = await repo.getSessionForUpdate(tx, sessionId);
        if (!s) throw new NotFoundError();
        const msgs = await tx.select().from(schema.messages).where(eq(schema.messages.id, messageId)).limit(1);
        if (s.revision !== tx1.revAfter1 || msgs[0]?.evalStatus !== "pending") return;
        const previous = await repo.getLatestRecord(tx, sessionId);
        if (!previous) throw new NotFoundError();
        const newRecordId = randomUUID();
        const { record, events } = createLearningRecord({ id: newRecordId, cycle: s.cycle, previous, evaluation: result.evaluation });
        await tx.insert(schema.learningRecords).values({
          id: newRecordId, sessionId, version: record.version, cycle: record.cycle,
          record: record,
          rubricVersion: RUBRIC_VERSION, validatorVersion: VALIDATOR_VERSION, evaluatorModel: result.model, sourceMessageId: messageId,
        });
        await persistEvents(tx, sessionId, newRecordId, events);
        const probe = selectProbe(record);
        if (probe) {
          const probeTurn = await repo.nextTurnNo(tx, sessionId);
          await tx.insert(schema.messages).values({
            id: randomUUID(), sessionId, turnNo: probeTurn, role: "learner", content: probe.text, inputMode: "typed", cycle: s.cycle, evalStatus: "not_applicable", probeId: probe.id,
          });
        }
        await tx.update(schema.messages).set({ evalStatus: "evaluated" }).where(eq(schema.messages.id, messageId));
        await tx.update(schema.sessions).set({ revision: s.revision + 1, updatedAt: new Date() }).where(eq(schema.sessions.id, sessionId));
      });
      return buildDTO(db, sessionId);
    },

    async createAttempt({ sessionId, ownerToken, expectedRevision, recordId, idempotencyKey }) {
      const route = "attempts";
      const requestHash = hashRequest({ expectedRevision, recordId: recordId ?? null });
      let replay: SessionDTO | undefined;
      await db.transaction(async (tx) => {
        const s = await loadOwned(tx, sessionId, ownerToken);
        const idem = await repo.getIdempotency(tx, { sessionId, route, key: idempotencyKey, requestHash });
        if (idem.kind === "stored") { replay = idem.response as SessionDTO; return; }
        if (idem.kind === "mismatch") throw new IdempotencyMismatchError();
        if (s.phase !== "teaching" && s.phase !== "reteaching") throw new ConflictError(s.phase, s.revision, "not in teaching or reteaching phase");
        if (s.revision !== expectedRevision) throw new ConflictError(s.phase, s.revision, "revision mismatch");
        // A pending OR failed teaching turn blocks a fresh assessment (§6).
        if ((await repo.countUnevaluated(tx, sessionId)) > 0) throw new ConflictError(s.phase, s.revision, "unevaluated teaching");

        const record = recordId
          ? await repo.getRecordById(tx, sessionId, recordId)
          : await repo.getLatestRecord(tx, sessionId);
        if (!record) throw new NotFoundError("record not found");

        const formId = s.phase === "teaching" ? "recursion.A" : "recursion.B";
        const form = getForm(formId);
        const attemptId = randomUUID();
        const attemptNo = s.phase === "teaching" ? 1 : 2;
        await tx.insert(schema.assessmentAttempts).values({
          id: attemptId, sessionId, attemptNo, formId: form.id, formVersion: form.version,
          gateVersion: GATE_VERSION, rubricVersion: RUBRIC_VERSION, learningRecordId: record.id,
          status: "in_progress", expectedResults: form.questions.length,
        });
        for (const question of form.questions) {
          const r = assessQuestion(record, question);
          await tx.insert(schema.questionResults).values({
            attemptId, questionId: r.questionId, pairId: r.pairId,
            questionSnapshot: question,
            outcome: r.outcome, points: r.points, maxPoints: r.maxPoints,
            earnedCriteria: r.earnedCriteria, fragmentIds: r.fragmentIds, answerText: r.answerText,
            blocking: r.blocking, nextStep: r.nextStep,
          });
        }
        const nextPhase = s.phase === "teaching" ? "assessing" : "reassessing";
        await tx.update(schema.sessions).set({ phase: nextPhase, revision: s.revision + 1, updatedAt: new Date() }).where(eq(schema.sessions.id, sessionId));
      });
      if (replay) return replay;
      const dto = await buildDTO(db, sessionId);
      await db.transaction((tx) => repo.putIdempotency(tx, { sessionId, route, key: idempotencyKey, requestHash, response: dto }));
      return dto;
    },

    async completeAttempt({ sessionId, ownerToken, attemptId, expectedRevision, idempotencyKey }) {
      const route = "complete";
      const requestHash = hashRequest({ attemptId, expectedRevision });
      let replay: SessionDTO | undefined;
      await db.transaction(async (tx) => {
        const s = await loadOwned(tx, sessionId, ownerToken);
        const idem = await repo.getIdempotency(tx, { sessionId, route, key: idempotencyKey, requestHash });
        if (idem.kind === "stored") { replay = idem.response as SessionDTO; return; }
        if (idem.kind === "mismatch") throw new IdempotencyMismatchError();
        if (s.phase !== "assessing" && s.phase !== "reassessing") throw new ConflictError(s.phase, s.revision, "not in assessing or reassessing phase");
        if (s.revision !== expectedRevision) throw new ConflictError(s.phase, s.revision, "revision mismatch");
        const rows = await tx.select().from(schema.assessmentAttempts)
          .where(and(eq(schema.assessmentAttempts.id, attemptId), eq(schema.assessmentAttempts.sessionId, sessionId))).limit(1);
        const attempt = rows[0];
        if (!attempt) throw new NotFoundError("attempt not found");
        const count = await repo.countResults(tx, attemptId);
        if (count !== attempt.expectedResults) throw new ConflictError(s.phase, s.revision, "results incomplete");
        await tx.update(schema.assessmentAttempts).set({ status: "complete", completedAt: new Date() }).where(eq(schema.assessmentAttempts.id, attemptId));
        const nextPhase = s.phase === "assessing" ? "reviewing" : "comparing";
        await tx.update(schema.sessions).set({ phase: nextPhase, revision: s.revision + 1, updatedAt: new Date() }).where(eq(schema.sessions.id, sessionId));
      });
      if (replay) return replay;
      const dto = await buildDTO(db, sessionId);
      await db.transaction((tx) => repo.putIdempotency(tx, { sessionId, route, key: idempotencyKey, requestHash, response: dto }));
      return dto;
    },

    async beginReteach({ sessionId, ownerToken, questionId, nextStepHint, expectedRevision, idempotencyKey }) {
      const route = "reteach";
      const requestHash = hashRequest({ expectedRevision, questionId, nextStepHint });
      let replay: SessionDTO | undefined;
      await db.transaction(async (tx) => {
        const s = await loadOwned(tx, sessionId, ownerToken);
        const idem = await repo.getIdempotency(tx, { sessionId, route, key: idempotencyKey, requestHash });
        if (idem.kind === "stored") { replay = idem.response as SessionDTO; return; }
        if (idem.kind === "mismatch") throw new IdempotencyMismatchError();
        if (s.phase !== "reviewing") throw new ConflictError(s.phase, s.revision, "not in reviewing phase");
        if (s.revision !== expectedRevision) throw new ConflictError(s.phase, s.revision, "revision mismatch");

        const nextCycle = s.cycle + 1;
        const turnNo = await repo.nextTurnNo(tx, sessionId);
        await tx.insert(schema.messages).values({
          id: randomUUID(), sessionId, turnNo, role: "learner", content: nextStepHint, inputMode: "typed", cycle: nextCycle, evalStatus: "not_applicable",
        });

        await tx.update(schema.sessions).set({ phase: "reteaching", cycle: nextCycle, revision: s.revision + 1, updatedAt: new Date() }).where(eq(schema.sessions.id, sessionId));
      });
      if (replay) return replay;
      const dto = await buildDTO(db, sessionId);
      await db.transaction((tx) => repo.putIdempotency(tx, { sessionId, route, key: idempotencyKey, requestHash, response: dto }));
      return dto;
    },

    async getSessionState({ sessionId, ownerToken }) {
      const session = await repo.getSession(db, sessionId);
      if (!session) throw new NotFoundError();
      assertOwner(session, ownerToken);
      return buildDTO(db, sessionId);
    },

    async getComparison({ sessionId, ownerToken }) {
      const dto = await this.getSessionState({ sessionId, ownerToken });
      if (dto.phase !== "comparing") throw new ConflictError(dto.phase, dto.revision, "not in comparing phase");
      if (!dto.comparison) throw new ConflictError(dto.phase, dto.revision, "comparison missing");
      return dto.comparison;
    },
  };
}
