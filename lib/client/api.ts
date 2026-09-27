import type { ComparisonRowDTO, MessageDTO, SessionDTO } from "@/lib/contracts";

/**
 * Typed browser API client. Same-origin fetch carries the httpOnly owner cookie
 * automatically. Callers generate one Idempotency-Key per user action and reuse
 * it on retries of that same action.
 */
export interface ApiError {
  status: number;
  error: string;
  detail?: string;
  phase?: SessionDTO["phase"];
  revision?: number;
  retryAfterSeconds?: number;
}

export interface HealthDTO {
  ok: boolean;
  db: "up" | "down";
}

function isApiError(x: unknown): x is ApiError {
  return typeof x === "object"
    && x !== null
    && "status" in x
    && typeof x.status === "number"
    && "error" in x
    && typeof x.error === "string";
}
export const asApiError = (x: unknown): ApiError => (isApiError(x) ? x : { status: 0, error: "network" });

export function apiErrorMessage(error: ApiError, fallback = "The request could not be completed."): string {
  const serverMessage = error.error.includes(" ") ? error.error : undefined;
  if (error.status === 0) return "Could not reach the server. Check your connection and try again.";
  if (error.status === 400) return error.detail ?? serverMessage ?? "The request was missing required information.";
  if (error.status === 404) return "The requested session or resource was not found.";
  if (error.status === 409) return "This session changed. Refresh the latest state and try again.";
  if (error.status === 422) {
    if (error.error === "idempotency_mismatch") return "This action conflicts with an earlier request. Please try the action again.";
    return error.detail ?? serverMessage ?? "The request could not be processed.";
  }
  if (error.status === 429) {
    if (serverMessage) {
      return error.retryAfterSeconds !== undefined
        ? `${serverMessage} Try again in ${error.retryAfterSeconds} seconds.`
        : serverMessage;
    }
    return error.retryAfterSeconds !== undefined
      ? `Too many requests. Try again in ${error.retryAfterSeconds} seconds.`
      : "Too many requests. Please wait before trying again.";
  }
  return serverMessage ?? fallback;
}

export function newIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) throw new Error("Secure UUID generation is unavailable");
  if (cryptoApi.randomUUID) return cryptoApi.randomUUID();

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function retryAfterSeconds(response: Response): number | undefined {
  const raw = response.headers.get("retry-after");
  if (raw === null) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

async function checkedFetch(path: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw { status: 0, error: "network" } as ApiError;
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const body = typeof data === "object" && data !== null ? data as Record<string, unknown> : {};
    throw {
      ...body,
      status: res.status,
      error: typeof body.error === "string" ? body.error : "request_failed",
      retryAfterSeconds: retryAfterSeconds(res),
    } as ApiError;
  }
  return res;
}

async function jsonCall<T>(path: string, method: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  const res = await checkedFetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res.json() as Promise<T>;
}

export const api = {
  createTopic: async (formData: FormData): Promise<{ topicId: string }> => {
    const res = await checkedFetch("/api/topics/create", { method: "POST", body: formData });
    return res.json() as Promise<{ topicId: string }>;
  },
  createSession: (args?: { topicId?: string }) => jsonCall<SessionDTO>("/api/sessions", "POST", args || {}),
  getHealth: () => jsonCall<HealthDTO>("/api/health", "GET"),
  getSession: (id: string) => jsonCall<SessionDTO>(`/api/sessions/${id}`, "GET"),
  submitTeaching: (id: string, args: { text: string; inputMode: MessageDTO["inputMode"]; expectedRevision: number; idempotencyKey: string }) =>
    jsonCall<SessionDTO>(
      `/api/sessions/${id}/messages`,
      "POST",
      { text: args.text, inputMode: args.inputMode, expectedRevision: args.expectedRevision },
      args.idempotencyKey,
    ),
  retry: (id: string, msgId: string, args: { expectedRevision: number }) =>
    jsonCall<SessionDTO>(`/api/sessions/${id}/messages/${msgId}/retry`, "POST", { expectedRevision: args.expectedRevision }),
  createAttempt: (id: string, args: { expectedRevision: number; idempotencyKey: string }) =>
    jsonCall<SessionDTO>(`/api/sessions/${id}/attempts`, "POST", { expectedRevision: args.expectedRevision }, args.idempotencyKey),
  complete: (attemptId: string, args: { sessionId: string; expectedRevision: number; idempotencyKey: string }) =>
    jsonCall<SessionDTO>(`/api/attempts/${attemptId}/complete`, "POST", { sessionId: args.sessionId, expectedRevision: args.expectedRevision }, args.idempotencyKey),
  reteach: (id: string, args: { questionId: string; nextStepHint: string; expectedRevision: number; idempotencyKey: string }) =>
    jsonCall<SessionDTO>(`/api/sessions/${id}/reteach`, "POST", { questionId: args.questionId, nextStepHint: args.nextStepHint, expectedRevision: args.expectedRevision }, args.idempotencyKey),
  getComparison: (id: string) => jsonCall<ComparisonRowDTO[]>(`/api/sessions/${id}/comparison`, "GET"),
  synthesizeSpeech: async (source: "learner_message" | "question_result", id: string): Promise<Blob> => {
    const res = await checkedFetch("/api/voice/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source, id }),
    });
    return res.blob();
  },
};
