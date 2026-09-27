import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import type { Db } from "./client";
import type { LearningRecord, Question, QuestionResult } from "@/lib/contracts";
import type { StudentTurn } from "@/lib/evaluator/provenance";
import type { AttemptShape, MessageRow, ResultRow } from "@/lib/session/dto";

/** Either the pool client or a transaction. */
export type Executor =
  | NodePgDatabase<typeof schema>
  | Parameters<Parameters<Db["transaction"]>[0]>[0];

export type SessionRow = typeof schema.sessions.$inferSelect;

export async function getSession(exec: Executor, sessionId: string): Promise<SessionRow | null> {
  const rows = await exec.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).limit(1);
  return rows[0] ?? null;
}

/** Lock the session row for the duration of a transaction. */
export async function getSessionForUpdate(exec: Executor, sessionId: string): Promise<SessionRow | null> {
  const rows = await exec.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).limit(1).for("update");
  return rows[0] ?? null;
}

export async function getMessages(exec: Executor, sessionId: string): Promise<MessageRow[]> {
  const rows = await exec
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.sessionId, sessionId))
    .orderBy(asc(schema.messages.turnNo));
  return rows.map((r) => ({
    id: r.id,
    turnNo: r.turnNo,
    role: r.role,
    content: r.content,
    inputMode: r.inputMode,
    cycle: r.cycle,
    evalStatus: r.evalStatus,
    evalError: r.evalError,
    probeId: r.probeId,
    createdAt: r.createdAt,
  }));
}

/** Student turns as StudentTurn[] with turn_id `t<turn_no>` (validator provenance). */
export async function getStudentTurns(exec: Executor, sessionId: string): Promise<StudentTurn[]> {
  const rows = await exec
    .select({ turnNo: schema.messages.turnNo, content: schema.messages.content })
    .from(schema.messages)
    .where(and(eq(schema.messages.sessionId, sessionId), eq(schema.messages.role, "student")))
    .orderBy(asc(schema.messages.turnNo));
  return rows.map((r) => ({ session_id: sessionId, turn_id: `t${r.turnNo}`, role: "student", text: r.content }));
}

export async function getLatestRecord(exec: Executor, sessionId: string): Promise<LearningRecord | null> {
  const rows = await exec
    .select()
    .from(schema.learningRecords)
    .where(eq(schema.learningRecords.sessionId, sessionId))
    .orderBy(desc(schema.learningRecords.version))
    .limit(1);
  return rows[0] ? (rows[0].record as LearningRecord) : null;
}

export async function getRecordById(exec: Executor, sessionId: string, recordId: string): Promise<LearningRecord | null> {
  const rows = await exec
    .select()
    .from(schema.learningRecords)
    .where(and(eq(schema.learningRecords.id, recordId), eq(schema.learningRecords.sessionId, sessionId)))
    .limit(1);
  return rows[0] ? (rows[0].record as LearningRecord) : null;
}

export async function countPendingEvaluations(exec: Executor, sessionId: string): Promise<number> {
  const rows = await exec
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.messages)
    .where(and(eq(schema.messages.sessionId, sessionId), eq(schema.messages.evalStatus, "pending")));
  return rows[0]?.n ?? 0;
}

/** Student turns still pending or failed evaluation — these block a fresh assessment. */
export async function countUnevaluated(exec: Executor, sessionId: string): Promise<number> {
  const rows = await exec
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.sessionId, sessionId),
        eq(schema.messages.role, "student"),
        sql`${schema.messages.evalStatus} in ('pending', 'failed')`,
      ),
    );
  return rows[0]?.n ?? 0;
}

export async function nextTurnNo(exec: Executor, sessionId: string): Promise<number> {
  const rows = await exec
    .select({ max: sql<number>`coalesce(max(${schema.messages.turnNo}), 0)::int` })
    .from(schema.messages)
    .where(eq(schema.messages.sessionId, sessionId));
  return (rows[0]?.max ?? 0) + 1;
}

/** Idempotency: returns the stored response, "mismatch", or "absent". */
export async function getIdempotency(
  exec: Executor,
  input: { sessionId: string; route: string; key: string; requestHash: string },
): Promise<{ kind: "stored"; response: unknown } | { kind: "mismatch" } | { kind: "absent" }> {
  const rows = await exec
    .select()
    .from(schema.idempotencyKeys)
    .where(
      and(
        eq(schema.idempotencyKeys.sessionId, input.sessionId),
        eq(schema.idempotencyKeys.route, input.route),
        eq(schema.idempotencyKeys.key, input.key),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return { kind: "absent" };
  if (row.requestHash !== input.requestHash) return { kind: "mismatch" };
  return { kind: "stored", response: row.response };
}

export async function putIdempotency(
  exec: Executor,
  input: { sessionId: string; route: string; key: string; requestHash: string; response: unknown },
): Promise<void> {
  await exec
    .insert(schema.idempotencyKeys)
    .values({
      sessionId: input.sessionId,
      route: input.route,
      key: input.key,
      requestHash: input.requestHash,
      statusCode: 200,
      response: input.response,
    })
    .onConflictDoNothing();
}

export async function getAttemptsWithResults(exec: Executor, sessionId: string): Promise<AttemptShape[]> {
  const attempts = await exec
    .select()
    .from(schema.assessmentAttempts)
    .where(eq(schema.assessmentAttempts.sessionId, sessionId))
    .orderBy(asc(schema.assessmentAttempts.attemptNo));
  const out: AttemptShape[] = [];
  for (const a of attempts) {
    const recordRow = await getRecordById(exec, sessionId, a.learningRecordId);
    if (!recordRow) throw new Error("Missing pinned record for attempt");
    const resultRows = await exec
      .select()
      .from(schema.questionResults)
      .where(eq(schema.questionResults.attemptId, a.id))
      .orderBy(asc(schema.questionResults.questionId));
    const results: ResultRow[] = resultRows.map((r) => {
      const question = r.questionSnapshot as Question;
      const result: QuestionResult & { id: string } = {
        id: r.id,
        questionId: r.questionId,
        pairId: r.pairId,
        outcome: r.outcome,
        points: r.points,
        maxPoints: r.maxPoints,
        earnedCriteria: r.earnedCriteria,
        fragmentIds: r.fragmentIds,
        answerText: r.answerText,
        blocking: r.blocking as QuestionResult["blocking"],
        nextStep: r.nextStep,
      };
      return { result, question };
    });
    out.push({
      id: a.id,
      attemptNo: a.attemptNo as 1 | 2,
      formId: a.formId,
      formVersion: a.formVersion,
      status: a.status as "in_progress" | "complete",
      results,
      pinnedRecord: recordRow,
    });
  }
  return out;
}

export async function countResults(exec: Executor, attemptId: string): Promise<number> {
  const rows = await exec
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.questionResults)
    .where(eq(schema.questionResults.attemptId, attemptId));
  return rows[0]?.n ?? 0;
}
