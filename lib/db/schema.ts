// Table metadata only (no secrets, no connection). The pool that actually
// connects lives in client.ts behind `import 'server-only'`.
import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  customType,
  unique,
  uniqueIndex,
  primaryKey,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";

/**
 * Database schema (ARCHITECTURE_REVISED §3). Seven tables, all history
 * append-only, composite (id, session_id) uniques + composite foreign keys so a
 * record, message and attempt used together must belong to the same session,
 * the partial unique index enforcing one pending evaluation per session, CHECK
 * constraints, and idempotency_keys. Plus a debug payload table gated by
 * DEBUG_LLM_PAYLOADS.
 */

const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const msgRole = pgEnum("msg_role", ["student", "learner"]);
export const inputMode = pgEnum("input_mode", ["typed", "voice"]);
export const evalStatus = pgEnum("eval_status", ["pending", "evaluated", "failed", "not_applicable"]);
export const sessionPhase = pgEnum("session_phase", [
  "teaching",
  "assessing",
  "reviewing",
  "reteaching",
  "reassessing",
  "comparing",
]);
export const outcome = pgEnum("outcome", ["correct", "partial", "misconception", "unsure"]);
export const attemptStatus = pgEnum("attempt_status", ["in_progress", "complete"]);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerTokenHash: bytea("owner_token_hash").notNull(),
  topicId: text("topic_id").notNull(),
  rubricVersion: text("rubric_version").notNull(),
  phase: sessionPhase("phase").notNull().default("teaching"),
  cycle: integer("cycle").notNull().default(1),
  revision: integer("revision").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    turnNo: integer("turn_no").notNull(),
    role: msgRole("role").notNull(),
    content: text("content").notNull(),
    inputMode: inputMode("input_mode").notNull().default("typed"),
    cycle: integer("cycle").notNull(),
    evalStatus: evalStatus("eval_status").notNull(),
    evalError: text("eval_error"),
    probeId: text("probe_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("messages_session_turn").on(t.sessionId, t.turnNo),
    unique("messages_id_session").on(t.id, t.sessionId),
    uniqueIndex("one_pending_eval").on(t.sessionId).where(sql`${t.evalStatus} = 'pending'`),
    check("messages_content_len", sql`char_length(${t.content}) <= 2000`),
  ],
);

export const learningRecords = pgTable(
  "learning_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    cycle: integer("cycle").notNull(),
    record: jsonb("record").notNull(),
    rubricVersion: text("rubric_version").notNull(),
    validatorVersion: text("validator_version").notNull(),
    evaluatorModel: text("evaluator_model"),
    sourceMessageId: uuid("source_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("learning_records_session_version").on(t.sessionId, t.version),
    unique("learning_records_id_session").on(t.id, t.sessionId),
    foreignKey({
      name: "learning_records_source_message_fk",
      columns: [t.sourceMessageId, t.sessionId],
      foreignColumns: [messages.id, messages.sessionId],
    }),
  ],
);

export const misconceptionEvents = pgTable(
  "misconception_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull(),
    learningRecordId: uuid("learning_record_id").notNull(),
    misconceptionId: text("misconception_id").notNull(),
    origin: text("origin").notNull(),
    event: text("event").notNull(),
    evidence: jsonb("evidence").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("misconception_events_origin", sql`${t.origin} IN ('seeded', 'student')`),
    check("misconception_events_event", sql`${t.event} IN ('activated', 'resolved', 'reactivated')`),
    foreignKey({
      name: "misconception_events_record_fk",
      columns: [t.learningRecordId, t.sessionId],
      foreignColumns: [learningRecords.id, learningRecords.sessionId],
    }),
  ],
);

export const assessmentAttempts = pgTable(
  "assessment_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    attemptNo: integer("attempt_no").notNull(),
    formId: text("form_id").notNull(),
    formVersion: text("form_version").notNull(),
    gateVersion: text("gate_version").notNull(),
    rubricVersion: text("rubric_version").notNull(),
    learningRecordId: uuid("learning_record_id").notNull(),
    status: attemptStatus("status").notNull().default("in_progress"),
    expectedResults: integer("expected_results").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    unique("attempts_session_attempt").on(t.sessionId, t.attemptNo),
    unique("attempts_id_session").on(t.id, t.sessionId),
    check("attempts_attempt_no", sql`${t.attemptNo} IN (1, 2)`),
    foreignKey({
      name: "attempts_record_fk",
      columns: [t.learningRecordId, t.sessionId],
      foreignColumns: [learningRecords.id, learningRecords.sessionId],
    }),
  ],
);

export const questionResults = pgTable(
  "question_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => assessmentAttempts.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull(),
    pairId: text("pair_id").notNull(),
    questionSnapshot: jsonb("question_snapshot").notNull(),
    outcome: outcome("outcome").notNull(),
    points: integer("points").notNull(),
    maxPoints: integer("max_points").notNull(),
    earnedCriteria: text("earned_criteria").array().notNull(),
    fragmentIds: text("fragment_ids").array().notNull(),
    answerText: text("answer_text").notNull(),
    blocking: jsonb("blocking").notNull(),
    nextStep: text("next_step"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("question_results_attempt_question").on(t.attemptId, t.questionId)],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    route: text("route").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    statusCode: integer("status_code"),
    response: jsonb("response"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.route, t.key] })],
);

/** Debug payloads, retained only when DEBUG_LLM_PAYLOADS=true; cleaned up by expiry. */
export const debugLlmPayloads = pgTable("debug_llm_payloads", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "cascade" }),
  messageId: uuid("message_id"),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
