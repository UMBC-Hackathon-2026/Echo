import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import * as schema from "@/lib/db/schema";
import { createSessionService, type SessionService } from "@/lib/session/service";
import {
  handlePostSessions, handleGetSession, handlePostMessages, handlePostRetry, handlePostAttempts, handlePostComplete,
} from "@/lib/http/handlers";
import { buildOwnerSetCookie } from "@/lib/http/cookies";
import { resetRateLimits } from "@/lib/http/rate-limit";
import { FakeEvaluator } from "@/tests/helpers/fake-evaluator";
import { hasTestDb, makeTestDb, truncateAll, okEvaluation } from "@/tests/helpers/test-db";

function req(url: string, opts: { method?: string; cookie?: string; idem?: string; ip?: string; body?: unknown } = {}): Request {
  const headers = new Headers();
  if (opts.cookie) headers.set("cookie", opts.cookie);
  if (opts.idem) headers.set("idempotency-key", opts.idem);
  headers.set("x-forwarded-for", opts.ip ?? "10.0.0.1");
  return new Request(url, { method: opts.method ?? "POST", headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
}
const cookieOf = (res: Response): string => (res.headers.get("set-cookie") ?? "").split(";")[0];

describe.skipIf(!hasTestDb)("api routes (DATABASE_URL_TEST)", () => {
  let pool: Pool;
  let db: ReturnType<typeof makeTestDb>["db"];
  beforeAll(() => { ({ pool, db } = makeTestDb()); });
  afterAll(async () => { await pool.end().catch(() => {}); });
  beforeEach(async () => { await truncateAll(pool); resetRateLimits(); });

  const svc = (fake: FakeEvaluator): SessionService => createSessionService({ evaluator: fake, db });

  async function start(fake: FakeEvaluator) {
    const res = await handlePostSessions(req("http://t/api/sessions", { body: {} }), svc(fake));
    expect(res.status).toBe(201);
    const dto = await res.json();
    return { sessionId: dto.sessionId as string, cookie: cookieOf(res), revision: dto.revision as number };
  }

  // Gate 9 — cookie flags
  it("sets an httpOnly, SameSite=Lax cookie; Secure only in production", async () => {
    const res = await handlePostSessions(req("http://t/api/sessions", { body: {} }), svc(new FakeEvaluator()));
    const sc = res.headers.get("set-cookie")!;
    expect(sc).toMatch(/HttpOnly/);
    expect(sc).toMatch(/SameSite=Lax/);
    expect(sc).not.toMatch(/Secure/); // test env
    const prev = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      expect(buildOwnerSetCookie("s", "tok")).toMatch(/Secure/);
    } finally {
      process.env.NODE_ENV = prev;
    }
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  // Gate 4 — ownership
  it("returns 404 for missing, wrong, and another session's cookie on every route", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const a = await start(fake);
    const other = await start(fake);
    const attemptId = randomUUID();
    for (const cookie of [undefined, `it_owner_${a.sessionId}=deadbeef`, other.cookie]) {
      expect((await handleGetSession(req(`http://t/s`, { method: "GET", cookie }), a.sessionId, s)).status).toBe(404);
      expect((await handlePostMessages(req(`http://t/m`, { cookie, idem: "k", body: { text: "x", expectedRevision: 0 } }), a.sessionId, s)).status).toBe(404);
      expect((await handlePostAttempts(req(`http://t/at`, { cookie, idem: "k", body: { expectedRevision: 0 } }), a.sessionId, s)).status).toBe(404);
      expect((await handlePostComplete(req(`http://t/c`, { cookie, idem: "k", body: { sessionId: a.sessionId, expectedRevision: 0 } }), attemptId, s)).status).toBe(404);
      expect((await handlePostRetry(req(`http://t/r`, { cookie, body: { expectedRevision: 0 } }), a.sessionId, randomUUID(), s)).status).toBe(404);
    }
  });

  // Gate 5 — idempotency
  it("replays a duplicate POST, rejects a reused key with a different body (422), and a missing key (400)", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const a = await start(fake);
    fake.push(okEvaluation(a.sessionId, ["t2"], { recursive_call: "demonstrated" }));
    const body = { text: "it calls itself", expectedRevision: 0 };
    const r1 = await handlePostMessages(req("http://t/m", { cookie: a.cookie, idem: "k1", body }), a.sessionId, s);
    expect(r1.status).toBe(200);
    const d1 = await r1.json();
    const r2 = await handlePostMessages(req("http://t/m", { cookie: a.cookie, idem: "k1", body }), a.sessionId, s);
    expect(await r2.json()).toEqual(d1);
    expect(fake.calls).toBe(1);
    const diff = await handlePostMessages(req("http://t/m", { cookie: a.cookie, idem: "k1", body: { text: "different", expectedRevision: 0 } }), a.sessionId, s);
    expect(diff.status).toBe(422);
    const noKey = await handlePostMessages(req("http://t/m", { cookie: a.cookie, body }), a.sessionId, s);
    expect(noKey.status).toBe(400);
  });

  // Gate 6 — conflicts
  it("returns 409 with phase and revision on a stale action", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const a = await start(fake);
    const res = await handlePostMessages(req("http://t/m", { cookie: a.cookie, idem: "k", body: { text: "x", expectedRevision: 99 } }), a.sessionId, s);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ error: "conflict", phase: "teaching", revision: 0 });
  });

  // Gate 7 — limits
  it("rejects 2001 chars, the 31st turn, and rate-limits with Retry-After", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const a = await start(fake);
    const tooLong = await handlePostMessages(req("http://t/m", { cookie: a.cookie, idem: "k", body: { text: "x".repeat(2001), expectedRevision: 0 } }), a.sessionId, s);
    expect(tooLong.status).toBe(400);

    // Fill turns up to 30 (turn 1 is the opening line), then the next teach is turn 31.
    for (let t = 2; t <= 30; t++) {
      await db.insert(schema.messages).values({ id: randomUUID(), sessionId: a.sessionId, turnNo: t, role: "learner", content: "filler", inputMode: "typed", cycle: 1, evalStatus: "not_applicable" });
    }
    const capped = await handlePostMessages(req("http://t/m", { cookie: a.cookie, idem: "k31", body: { text: "one more", expectedRevision: 0 } }), a.sessionId, s);
    expect(capped.status).toBe(422);

    // Rate limit: capacity 10 for this ip+session.
    resetRateLimits();
    let last: Response | undefined;
    for (let i = 0; i < 12; i++) {
      last = await handlePostMessages(req("http://t/m", { cookie: a.cookie, ip: "9.9.9.9", body: {} }), a.sessionId, s);
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get("retry-after")).toBeTruthy();
  });

  // Gate 8 — DTO leakage
  it("leaks no answer keys or secrets before completion", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const a = await start(fake);
    fake.push(okEvaluation(a.sessionId, ["t2"], { base_case: "demonstrated" }));
    const teach = await handlePostMessages(req("http://t/m", { cookie: a.cookie, idem: "m1", body: { text: "stops at 0", expectedRevision: 0 } }), a.sessionId, s);
    const rev = (await teach.json()).revision;
    const att = await handlePostAttempts(req("http://t/at", { cookie: a.cookie, idem: "a1", body: { expectedRevision: rev } }), a.sessionId, s);
    const text = await att.text();
    expect(text).not.toContain("answerKey");
    expect(text).not.toContain("supportsCriterion");
    expect(text).not.toMatch(/GEMINI|DATABASE_URL|postgres:\/\//);
  });

  // Gate 10 — evaluator failure is a 200 with a failed message; retry succeeds
  it("returns 200 with a failed message on evaluator failure, and a later retry succeeds", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const a = await start(fake);
    fake.push({ ok: false, reason: "timeout", attempts: 2 });
    const res = await handlePostMessages(req("http://t/m", { cookie: a.cookie, idem: "m1", body: { text: "explain", expectedRevision: 0 } }), a.sessionId, s);
    expect(res.status).toBe(200);
    const dto = await res.json();
    const student = dto.messages.find((m: { role: string }) => m.role === "student");
    expect(student.evalStatus).toBe("failed");
    expect(student.content).toBe("explain");

    fake.push(okEvaluation(a.sessionId, ["t2"], { base_case: "demonstrated" }));
    const retry = await handlePostRetry(req("http://t/r", { cookie: a.cookie, body: { expectedRevision: dto.revision } }), a.sessionId, student.id, s);
    expect(retry.status).toBe(200);
    const after = await retry.json();
    expect(after.messages.find((m: { role: string }) => m.role === "student").evalStatus).toBe("evaluated");
    expect(after.record.version).toBe(1);
  });
});
