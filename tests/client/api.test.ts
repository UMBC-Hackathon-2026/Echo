import { afterEach, describe, expect, it, vi } from "vitest";
import { api, apiErrorMessage, asApiError, type ApiError } from "@/lib/client/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

function requestAt(mock: ReturnType<typeof vi.fn>, index: number) {
  const [path, init] = mock.mock.calls[index] as [string, RequestInit];
  return {
    path,
    method: init.method,
    headers: new Headers(init.headers),
    body: init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined,
  };
}

describe("browser API contract", () => {
  it("sends the backend's exact mutation headers and bodies", async () => {
    const fetchMock = vi.fn(async () => Response.json({ sessionId: "session" }));
    vi.stubGlobal("fetch", fetchMock);

    await api.submitTeaching("session", { text: "Explanation", inputMode: "typed", expectedRevision: 1, idempotencyKey: "teach-key" });
    await api.retry("session", "message", { expectedRevision: 2 });
    await api.createAttempt("session", { expectedRevision: 3, idempotencyKey: "attempt-key" });
    await api.complete("attempt", { sessionId: "session", expectedRevision: 4, idempotencyKey: "complete-key" });
    await api.reteach("session", { questionId: "question", nextStepHint: "Try the base case.", expectedRevision: 5, idempotencyKey: "reteach-key" });

    expect(requestAt(fetchMock, 0)).toEqual({
      path: "/api/sessions/session/messages",
      method: "POST",
      headers: expect.any(Headers),
      body: { text: "Explanation", inputMode: "typed", expectedRevision: 1 },
    });
    expect(requestAt(fetchMock, 0).headers.get("idempotency-key")).toBe("teach-key");

    expect(requestAt(fetchMock, 1).body).toEqual({ expectedRevision: 2 });
    expect(requestAt(fetchMock, 1).headers.get("idempotency-key")).toBeNull();

    expect(requestAt(fetchMock, 2).body).toEqual({ expectedRevision: 3 });
    expect(requestAt(fetchMock, 2).headers.get("idempotency-key")).toBe("attempt-key");

    expect(requestAt(fetchMock, 3).body).toEqual({ sessionId: "session", expectedRevision: 4 });
    expect(requestAt(fetchMock, 3).headers.get("idempotency-key")).toBe("complete-key");

    expect(requestAt(fetchMock, 4).body).toEqual({ questionId: "question", nextStepHint: "Try the base case.", expectedRevision: 5 });
    expect(requestAt(fetchMock, 4).headers.get("idempotency-key")).toBe("reteach-key");
  });

  it("returns comparison rows as the backend's bare array", async () => {
    const rows = [{ pairId: "pair" }];
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(rows)));

    await expect(api.getComparison("session")).resolves.toEqual(rows);
  });

  it("preserves typed errors and Retry-After metadata", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": "17" } },
    )));

    const thrown = await api.getSession("session").catch((error: unknown) => error);
    const parsed = asApiError(thrown);

    expect(parsed).toMatchObject({ status: 429, error: "rate_limited", retryAfterSeconds: 17 });
    expect(apiErrorMessage(parsed)).toBe("Too many requests. Try again in 17 seconds.");
  });

  const errorCases: Array<[ApiError, string]> = [
    [{ status: 400, error: "bad_request", detail: "missing field" }, "missing field"],
    [{ status: 404, error: "not_found" }, "The requested session or resource was not found."],
    [{ status: 409, error: "conflict", phase: "teaching", revision: 2 }, "This session changed. Refresh the latest state and try again."],
    [{ status: 422, error: "idempotency_mismatch" }, "This action conflicts with an earlier request. Please try the action again."],
    [{ status: 422, error: "invalid_request", detail: "invalid value" }, "invalid value"],
  ];

  it.each(errorCases)("formats API error %j", (error, expected) => {
    expect(apiErrorMessage(error)).toBe(expected);
  });
});
