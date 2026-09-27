import type { SessionDTO } from "@/lib/contracts";

/**
 * Typed browser API client. Same-origin fetch carries the httpOnly owner cookie
 * automatically. Callers generate one Idempotency-Key per user action and reuse
 * it on retries of that same action.
 */
export interface ApiError {
  status: number;
  error: string;
  phase?: SessionDTO["phase"];
  revision?: number;
}

function isApiError(x: unknown): x is ApiError {
  return typeof x === "object" && x !== null && "status" in x;
}
export const asApiError = (x: unknown): ApiError => (isApiError(x) ? x : { status: 0, error: "network" });

export function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function call(path: string, method: string, body?: unknown, idempotencyKey?: string): Promise<SessionDTO> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw { status: 0, error: "network" } as ApiError;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, ...(data as object) } as ApiError;
  return data as SessionDTO;
}

export const api = {
  createSession: (args?: { topicId?: string }) => call("/api/sessions", "POST", args || {}),
  getSession: (id: string) => call(`/api/sessions/${id}`, "GET"),
  submitTeaching: (id: string, args: { text: string; expectedRevision: number; idempotencyKey: string }) =>
    call(`/api/sessions/${id}/messages`, "POST", { text: args.text, expectedRevision: args.expectedRevision }, args.idempotencyKey),
  retry: (id: string, msgId: string, args: { expectedRevision: number }) =>
    call(`/api/sessions/${id}/messages/${msgId}/retry`, "POST", { expectedRevision: args.expectedRevision }),
  createAttempt: (id: string, args: { expectedRevision: number; idempotencyKey: string }) =>
    call(`/api/sessions/${id}/attempts`, "POST", { expectedRevision: args.expectedRevision }, args.idempotencyKey),
  complete: (attemptId: string, args: { sessionId: string; expectedRevision: number; idempotencyKey: string }) =>
    call(`/api/attempts/${attemptId}/complete`, "POST", { sessionId: args.sessionId, expectedRevision: args.expectedRevision }, args.idempotencyKey),
  reteach: (id: string, args: { questionId: string; nextStepHint: string; expectedRevision: number; idempotencyKey: string }) =>
    call(`/api/sessions/${id}/reteach`, "POST", { questionId: args.questionId, nextStepHint: args.nextStepHint, expectedRevision: args.expectedRevision }, args.idempotencyKey),
  getComparison: async (id: string): Promise<import("@/lib/contracts").ComparisonRowDTO[]> => {
    const res = await fetch(`/api/sessions/${id}/comparison`, { method: "GET" });
    if (!res.ok) throw { status: res.status, error: "network" };
    return res.json();
  },
};
