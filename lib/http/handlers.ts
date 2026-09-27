import "server-only";
import { z } from "zod";
import type { SessionService } from "@/lib/session/service";
import { ConflictError, IdempotencyMismatchError, InvalidInputError, NotFoundError } from "@/lib/session/errors";
import { buildOwnerSetCookie, readOwnerToken } from "./cookies";
import { takeToken } from "./rate-limit";

/**
 * Thin, framework-agnostic route handlers over the session service
 * (ARCHITECTURE_REVISED §4). Every response is a public DTO with
 * `Cache-Control: no-store`; errors map to typed statuses; no DB rows leak.
 */

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extraHeaders },
  });
}

function mapError(e: unknown): Response {
  if (e instanceof NotFoundError) return json({ error: "not_found" }, 404);
  if (e instanceof ConflictError) return json({ error: "conflict", phase: e.phase, revision: e.revision }, 409);
  if (e instanceof IdempotencyMismatchError) return json({ error: "idempotency_mismatch" }, 422);
  if (e instanceof InvalidInputError) return json({ error: "invalid_input" }, 422);
  return json({ error: "internal" }, 500);
}

function clientIp(request: Request): string {
  return (request.headers.get("x-forwarded-for")?.split(",")[0].trim()) || request.headers.get("x-real-ip") || "unknown";
}

/** Returns a 400 Response if the mutating preconditions are missing, else the key. */
function requireIdempotencyKey(request: Request): string | Response {
  const key = request.headers.get("idempotency-key");
  if (!key) return json({ error: "bad_request", detail: "missing Idempotency-Key" }, 400);
  return key;
}

function rateLimit(request: Request, sessionId: string): Response | null {
  const ip = takeToken(`ip:${clientIp(request)}`);
  if (!ip.ok) return json({ error: "rate_limited" }, 429, { "retry-after": String(ip.retryAfterSec) });
  const sess = takeToken(`session:${sessionId}`);
  if (!sess.ok) return json({ error: "rate_limited" }, 429, { "retry-after": String(sess.retryAfterSec) });
  return null;
}

async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T | Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "bad_request", detail: "invalid JSON" }, 400);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return json({ error: "bad_request", detail: "invalid body" }, 400);
  return parsed.data;
}

const SessionsBody = z.object({ topicId: z.string().min(1).max(100).optional() }).strict();
const MessagesBody = z
  .object({ text: z.string().min(1).max(2000), inputMode: z.enum(["typed", "voice"]).optional(), expectedRevision: z.number().int() })
  .strict();
const RetryBody = z.object({ expectedRevision: z.number().int() }).strict();
const AttemptsBody = z.object({ expectedRevision: z.number().int(), recordId: z.string().optional() }).strict();
const CompleteBody = z.object({ sessionId: z.string(), expectedRevision: z.number().int() }).strict();
const ReteachBody = z.object({ questionId: z.string(), nextStepHint: z.string(), expectedRevision: z.number().int() }).strict();

export async function handlePostSessions(request: Request, service: SessionService): Promise<Response> {
  const body = await parseBody(request, SessionsBody);
  if (body instanceof Response) return body;
  try {
    const { sessionId, ownerToken, dto } = await service.createSession(body);
    return json(dto, 201, { "set-cookie": buildOwnerSetCookie(sessionId, ownerToken) });
  } catch (e) {
    return mapError(e);
  }
}

export async function handleGetSession(request: Request, sessionId: string, service: SessionService): Promise<Response> {
  const ownerToken = readOwnerToken(request, sessionId) ?? "";
  try {
    return json(await service.getSessionState({ sessionId, ownerToken }));
  } catch (e) {
    return mapError(e);
  }
}

export async function handlePostMessages(request: Request, sessionId: string, service: SessionService): Promise<Response> {
  const limited = rateLimit(request, sessionId);
  if (limited) return limited;
  const key = requireIdempotencyKey(request);
  if (key instanceof Response) return key;
  const body = await parseBody(request, MessagesBody);
  if (body instanceof Response) return body;
  const ownerToken = readOwnerToken(request, sessionId) ?? "";
  try {
    return json(await service.submitTeaching({ sessionId, ownerToken, text: body.text, inputMode: body.inputMode, expectedRevision: body.expectedRevision, idempotencyKey: key }));
  } catch (e) {
    return mapError(e);
  }
}

export async function handlePostRetry(request: Request, sessionId: string, msgId: string, service: SessionService): Promise<Response> {
  const limited = rateLimit(request, sessionId);
  if (limited) return limited;
  const body = await parseBody(request, RetryBody);
  if (body instanceof Response) return body;
  const ownerToken = readOwnerToken(request, sessionId) ?? "";
  try {
    return json(await service.retryEvaluation({ sessionId, ownerToken, messageId: msgId, expectedRevision: body.expectedRevision }));
  } catch (e) {
    return mapError(e);
  }
}

export async function handlePostAttempts(request: Request, sessionId: string, service: SessionService): Promise<Response> {
  const key = requireIdempotencyKey(request);
  if (key instanceof Response) return key;
  const body = await parseBody(request, AttemptsBody);
  if (body instanceof Response) return body;
  const ownerToken = readOwnerToken(request, sessionId) ?? "";
  try {
    return json(await service.createAttempt({ sessionId, ownerToken, expectedRevision: body.expectedRevision, recordId: body.recordId, idempotencyKey: key }));
  } catch (e) {
    return mapError(e);
  }
}

export async function handlePostComplete(request: Request, attemptId: string, service: SessionService): Promise<Response> {
  const key = requireIdempotencyKey(request);
  if (key instanceof Response) return key;
  const body = await parseBody(request, CompleteBody);
  if (body instanceof Response) return body;
  const ownerToken = readOwnerToken(request, body.sessionId) ?? "";
  try {
    return json(await service.completeAttempt({ sessionId: body.sessionId, ownerToken, attemptId, expectedRevision: body.expectedRevision, idempotencyKey: key }));
  } catch (e) {
    return mapError(e);
  }
}

export async function handlePostReteach(request: Request, sessionId: string, service: SessionService): Promise<Response> {
  const key = requireIdempotencyKey(request);
  if (key instanceof Response) return key;
  const body = await parseBody(request, ReteachBody);
  if (body instanceof Response) return body;
  const ownerToken = readOwnerToken(request, sessionId) ?? "";
  try {
    return json(await service.beginReteach({ sessionId, ownerToken, questionId: body.questionId, nextStepHint: body.nextStepHint, expectedRevision: body.expectedRevision, idempotencyKey: key }));
  } catch (e) {
    return mapError(e);
  }
}

export async function handleGetComparison(request: Request, sessionId: string, service: SessionService): Promise<Response> {
  const ownerToken = readOwnerToken(request, sessionId) ?? "";
  try {
    return json(await service.getComparison({ sessionId, ownerToken }));
  } catch (e) {
    return mapError(e);
  }
}
