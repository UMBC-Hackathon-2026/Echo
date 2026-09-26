/**
 * Bounded retry runner for the evaluator (ARCHITECTURE_REVISED §4, §7). One
 * total budget per teach operation: at most `maxAttempts`, a wall-clock
 * `totalMs`, Retry-After honored only if it fits the remaining budget. This is
 * the ONLY retry layer — the SDK's own retries are disabled, so nothing nests.
 * Pure and deterministic via injectable `now`/`sleep`.
 */
export type EvaluationFailure = "timeout" | "rate_limited" | "invalid_output" | "provider_error";

export type AttemptOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; reason: EvaluationFailure; retryAfterMs?: number };

export interface BudgetOptions {
  totalMs: number;
  maxAttempts: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export type BudgetResult<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; reason: EvaluationFailure; attempts: number };

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runWithBudget<T>(
  callOnce: (ctx: { attempt: number; remainingMs: number }) => Promise<AttemptOutcome<T>>,
  opts: BudgetOptions,
): Promise<BudgetResult<T>> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? realSleep;
  const deadline = now() + opts.totalMs;
  let attempts = 0;
  let lastReason: EvaluationFailure = "provider_error";

  while (attempts < opts.maxAttempts) {
    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      lastReason = "timeout";
      break;
    }
    attempts++;
    const res = await callOnce({ attempt: attempts, remainingMs });
    if (res.ok) return { ok: true, value: res.value, attempts };

    lastReason = res.reason;
    // A call that itself hit the wall-clock deadline ends the operation.
    if (res.reason === "timeout") break;
    if (res.reason === "rate_limited" && res.retryAfterMs != null) {
      if (now() + res.retryAfterMs >= deadline) break; // would exceed budget: fail fast
      await sleep(res.retryAfterMs);
    }
    // invalid_output / provider_error / rate_limited-within-budget: retry if attempts remain.
  }

  return { ok: false, reason: lastReason, attempts };
}
