import "server-only";
import type {
  AttemptDTO,
  ConceptId,
  LearningRecord,
  MessageDTO,
  Question,
  QuestionResult,
  QuestionResultDTO,
  RecordDTO,
  SessionDTO,
  SessionPhase,
} from "@/lib/contracts";

/**
 * Public DTO mappers (ARCHITECTURE_REVISED §4, §6). Every function builds an
 * EXPLICIT object — database rows and rubric objects are never spread. Answer
 * keys and criteria appear only for completed attempts (`includeReview`).
 */

export interface MessageRow {
  id: string;
  turnNo: number;
  role: "student" | "learner";
  content: string;
  inputMode: "typed" | "voice";
  cycle: number;
  evalStatus: "pending" | "evaluated" | "failed" | "not_applicable";
  evalError: string | null;
  probeId: string | null;
  createdAt: Date;
}

export function toMessageDTO(m: MessageRow): MessageDTO {
  const dto: MessageDTO = {
    id: m.id,
    turnNo: m.turnNo,
    role: m.role,
    content: m.content,
    inputMode: m.inputMode,
    cycle: m.cycle,
    evalStatus: m.evalStatus,
    createdAt: m.createdAt.toISOString(),
  };
  if (m.evalError) dto.evalError = m.evalError;
  if (m.probeId) dto.probeId = m.probeId;
  return dto;
}

export function toRecordDTO(record: LearningRecord): RecordDTO {
  const concepts = {} as RecordDTO["concepts"];
  for (const id of Object.keys(record.concepts) as ConceptId[]) {
    const c = record.concepts[id];
    concepts[id] = {
      state: c.state,
      evidence: c.evidence.map((s) => ({ ...s })),
      conflicts: c.conflicts.map((s) => ({ ...s })),
      uncertain: c.uncertain,
      reason: c.reason,
    };
  }
  const misconceptions: RecordDTO["misconceptions"] = {};
  for (const [key, m] of Object.entries(record.misconceptions)) {
    misconceptions[key] = { origin: m.origin, status: m.status, evidence: m.evidence.map((s) => ({ ...s })) };
  }
  return { id: record.id, version: record.version, cycle: record.cycle, rubricVersion: record.rubric_version, concepts, misconceptions };
}

/** A persisted result plus its frozen question snapshot. */
export interface ResultRow {
  result: QuestionResult & { id?: string };
  question: Question;
}

export function toQuestionResultDTO(row: ResultRow, includeReview: boolean): QuestionResultDTO {
  const q = row.question;
  const dto: QuestionResultDTO = {
    id: row.result.id ?? "unknown",
    questionId: row.result.questionId,
    pairId: row.result.pairId,
    outcome: row.result.outcome,
    points: row.result.points,
    maxPoints: row.result.maxPoints,
    earnedCriteria: [...row.result.earnedCriteria],
    fragmentIds: [...row.result.fragmentIds],
    answerText: row.result.answerText,
    blocking: { concepts: [...row.result.blocking.concepts], misconceptions: [...row.result.blocking.misconceptions] },
    nextStep: row.result.nextStep,
    question: {
      id: q.id,
      pairId: q.pairId,
      type: q.type,
      difficulty: q.difficulty,
      prompt: q.prompt,
      code: q.code,
      assumptions: q.assumptions,
    },
  };
  if (includeReview) {
    dto.review = {
      answerKey: q.answerKey,
      criteria: q.criteria.map((c) => ({ id: c.id, text: c.text, points: c.points, requires: [...c.requires] })),
    };
  }
  return dto;
}

export interface AttemptShape {
  id: string;
  attemptNo: 1 | 2;
  formId: string;
  formVersion: string;
  status: "in_progress" | "complete";
  results: ResultRow[];
  pinnedRecord: LearningRecord;
}

export function toAttemptDTO(a: AttemptShape): AttemptDTO {
  const includeReview = a.status === "complete";
  return {
    id: a.id,
    attemptNo: a.attemptNo,
    formId: a.formId,
    formVersion: a.formVersion,
    status: a.status,
    results: a.results.map((r) => toQuestionResultDTO(r, includeReview)),
    pinnedRecord: toRecordDTO(a.pinnedRecord),
  };
}

export function toSessionDTO(input: {
  sessionId: string;
  topic: { id: string; name: string; rubricData: any };
  phase: SessionPhase;
  revision: number;
  cycle: number;
  messages: MessageRow[];
  record: LearningRecord;
  attempts: AttemptShape[];
}): SessionDTO {
  const safeRubricData = input.topic.rubricData ? {
    ...input.topic.rubricData,
    questions: (input.topic.rubricData.questions || []).map((q: any) => ({
      id: q.id,
      pairId: q.pairId,
      type: q.type,
      difficulty: q.difficulty,
      prompt: q.prompt,
      code: q.code,
      assumptions: q.assumptions,
    }))
  } : undefined;

  return {
    sessionId: input.sessionId,
    topic: { id: input.topic.id, name: input.topic.name, rubricData: safeRubricData },
    phase: input.phase,
    revision: input.revision,
    cycle: input.cycle,
    messages: input.messages.map(toMessageDTO),
    record: toRecordDTO(input.record),
    attempts: input.attempts.map(toAttemptDTO),
  };
}
