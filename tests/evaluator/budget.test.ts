import { describe, it, expect } from "vitest";
import { runWithBudget, type AttemptOutcome } from "@/lib/evaluator/budget";

/** Controllable clock: `now()` reads t; `sleep(ms)` advances t. */
function clock(start = 0) {
  let t = start;
  return { now: () => t, sleep: async (ms: number) => { t += ms; }, advance: (ms: number) => { t += ms; } };
}

const ok = <T>(value: T): AttemptOutcome<T> => ({ ok: true, value });

describe("runWithBudget", () => {
  it("succeeds after one invalid attempt, using at most 2 attempts", async () => {
    const c = clock();
    let n = 0;
    const res = await runWithBudget(async () => {
      n++;
      c.advance(10);
      return n === 1 ? ({ ok: false, reason: "invalid_output" } as const) : ok("v");
    }, { totalMs: 20_000, maxAttempts: 2, now: c.now, sleep: c.sleep });
    expect(res).toEqual({ ok: true, value: "v", attempts: 2 });
    expect(n).toBe(2);
  });

  it("fails after two invalid attempts and never exceeds maxAttempts", async () => {
    const c = clock();
    let n = 0;
    const res = await runWithBudget(async () => { n++; c.advance(10); return { ok: false, reason: "invalid_output" } as const; },
      { totalMs: 20_000, maxAttempts: 2, now: c.now, sleep: c.sleep });
    expect(res).toEqual({ ok: false, reason: "invalid_output", attempts: 2 });
    expect(n).toBe(2);
  });

  it("honors Retry-After within budget (sleeps, then retries)", async () => {
    const c = clock();
    const sleeps: number[] = [];
    let n = 0;
    const res = await runWithBudget(async () => {
      n++;
      return n === 1 ? ({ ok: false, reason: "rate_limited", retryAfterMs: 200 } as const) : ok("v");
    }, { totalMs: 20_000, maxAttempts: 2, now: c.now, sleep: async (ms) => { sleeps.push(ms); await c.sleep(ms); } });
    expect(res.ok).toBe(true);
    expect(sleeps).toEqual([200]);
  });

  it("fails fast when Retry-After exceeds the remaining budget (no extra attempt, no sleep)", async () => {
    const c = clock();
    const sleeps: number[] = [];
    let n = 0;
    const res = await runWithBudget(async () => { n++; return { ok: false, reason: "rate_limited", retryAfterMs: 5_000 } as const; },
      { totalMs: 1_000, maxAttempts: 2, now: c.now, sleep: async (ms) => { sleeps.push(ms); await c.sleep(ms); } });
    expect(res).toEqual({ ok: false, reason: "rate_limited", attempts: 1 });
    expect(n).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it("stops on a timeout outcome without another attempt", async () => {
    const c = clock();
    let n = 0;
    const res = await runWithBudget(async () => { n++; return { ok: false, reason: "timeout" } as const; },
      { totalMs: 20_000, maxAttempts: 2, now: c.now, sleep: c.sleep });
    expect(res).toEqual({ ok: false, reason: "timeout", attempts: 1 });
    expect(n).toBe(1);
  });

  it("never starts an attempt after the deadline (budget not exceeded)", async () => {
    const c = clock();
    let n = 0;
    const res = await runWithBudget(async () => { n++; c.advance(15_000); return { ok: false, reason: "invalid_output" } as const; },
      { totalMs: 20_000, maxAttempts: 5, now: c.now, sleep: c.sleep });
    // Two attempts start within the 20s window; the third would begin past it.
    expect(n).toBe(2);
    expect(res).toEqual({ ok: false, reason: "timeout", attempts: 2 });
  });
});
