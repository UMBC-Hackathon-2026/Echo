import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Pool } from "pg";
import { createSessionService, type SessionService } from "@/lib/session/service";
import {
  handlePostSessions, handlePostMessages, handlePostAttempts, handlePostComplete, handlePostReteach, handleGetComparison,
} from "@/lib/http/handlers";
import { resetRateLimits } from "@/lib/http/rate-limit";
import type { ConceptId, ConceptState } from "@/lib/contracts";
import { FakeEvaluator } from "@/tests/helpers/fake-evaluator";
import { hasTestDb, makeTestDb, okEvaluation } from "@/tests/helpers/test-db";

function req(url: string, opts: { method?: string; cookie?: string; idem?: string; body?: unknown } = {}): Request {
  const headers = new Headers();
  if (opts.cookie) headers.set("cookie", opts.cookie);
  if (opts.idem) headers.set("idempotency-key", opts.idem);
  headers.set("x-forwarded-for", "10.0.0.2");
  return new Request(url, { method: opts.method ?? "POST", headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
}
const cookieOf = (res: Response): string => (res.headers.get("set-cookie") ?? "").split(";")[0];

const CYCLE1: Partial<Record<ConceptId, ConceptState>> = { recursive_call: "demonstrated", smaller_subproblem: "demonstrated" };
const CYCLE2_GOOD: Partial<Record<ConceptId, ConceptState>> = {
  recursive_call: "demonstrated", smaller_subproblem: "demonstrated", base_case: "demonstrated", progress_toward_base_case: "demonstrated",
};

describe.skipIf(!hasTestDb)("phase 4 routes: reteach + comparison (DATABASE_URL_TEST)", () => {
  let pool: Pool;
  let db: ReturnType<typeof makeTestDb>["db"];
  beforeAll(() => { ({ pool, db } = makeTestDb()); });
  afterAll(async () => { await pool.end().catch(() => {}); });
  beforeEach(() => { resetRateLimits(); });

  const svc = (fake: FakeEvaluator): SessionService => createSessionService({ evaluator: fake, db });

  async function start(s: SessionService) {
    const res = await handlePostSessions(req("http://t/api/sessions", { body: {} }), s);
    const dto = await res.json();
    return { sessionId: dto.sessionId as string, cookie: cookieOf(res), revision: dto.revision as number };
  }

  /** Drive to `reviewing` through the HTTP handlers. */
  async function toReviewing(s: SessionService, fake: FakeEvaluator) {
    const a = await start(s);
    fake.push(okEvaluation(a.sessionId, ["t2"], CYCLE1));
    let dto = await (await handlePostMessages(req("http://t/m", { cookie: a.cookie, idem: "m1", body: { text: "calls itself on smaller n", expectedRevision: 0 } }), a.sessionId, s)).json();
    dto = await (await handlePostAttempts(req("http://t/at", { cookie: a.cookie, idem: "a1", body: { expectedRevision: dto.revision } }), a.sessionId, s)).json();
    const attempt1Id = dto.attempts[0].id as string;
    dto = await (await handlePostComplete(req("http://t/c", { cookie: a.cookie, idem: "c1", body: { sessionId: a.sessionId, expectedRevision: dto.revision } }), attempt1Id, s)).json();
    return { ...a, revision: dto.revision as number, attempt1Id };
  }

  async function toComparing(s: SessionService, fake: FakeEvaluator, ctx: Awaited<ReturnType<typeof toReviewing>>) {
    let dto = await (await handlePostReteach(req("http://t/rt", { cookie: ctx.cookie, idem: "rt1", body: { questionId: "rec.A.P1", nextStepHint: "stop at 0", expectedRevision: ctx.revision } }), ctx.sessionId, s)).json();
    fake.push(okEvaluation(ctx.sessionId, ["t2", "t5"], CYCLE2_GOOD));
    dto = await (await handlePostMessages(req("http://t/m", { cookie: ctx.cookie, idem: "m2", body: { text: "at n===0 it returns", expectedRevision: dto.revision } }), ctx.sessionId, s)).json();
    dto = await (await handlePostAttempts(req("http://t/at", { cookie: ctx.cookie, idem: "a2", body: { expectedRevision: dto.revision } }), ctx.sessionId, s)).json();
    const attempt2Id = dto.attempts.find((x: { attemptNo: number }) => x.attemptNo === 2).id as string;
    dto = await (await handlePostComplete(req("http://t/c", { cookie: ctx.cookie, idem: "c2", body: { sessionId: ctx.sessionId, expectedRevision: dto.revision } }), attempt2Id, s)).json();
    return { revision: dto.revision as number };
  }

  it("reteach: 404 for missing/wrong/other-session cookies", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const a = await start(s);
    const other = await start(s);
    for (const cookie of [undefined, `it_owner_${a.sessionId}=deadbeef`, other.cookie]) {
      const res = await handlePostReteach(req("http://t/rt", { cookie, idem: "k", body: { questionId: "q", nextStepHint: "h", expectedRevision: 0 } }), a.sessionId, s);
      expect(res.status).toBe(404);
    }
  });

  it("reteach: 400 without an Idempotency-Key; 409 when not in reviewing", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const a = await start(s);
    const noKey = await handlePostReteach(req("http://t/rt", { cookie: a.cookie, body: { questionId: "q", nextStepHint: "h", expectedRevision: 0 } }), a.sessionId, s);
    expect(noKey.status).toBe(400);
    const wrongPhase = await handlePostReteach(req("http://t/rt", { cookie: a.cookie, idem: "k", body: { questionId: "q", nextStepHint: "h", expectedRevision: 0 } }), a.sessionId, s);
    expect(wrongPhase.status).toBe(409);
    expect(await wrongPhase.json()).toMatchObject({ error: "conflict", phase: "teaching" });
  });

  it("reteach: replays a duplicate key, 422 on a reused key with a different body", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const ctx = await toReviewing(s, fake);
    const body = { questionId: "rec.A.P1", nextStepHint: "stop at 0", expectedRevision: ctx.revision };
    const r1 = await handlePostReteach(req("http://t/rt", { cookie: ctx.cookie, idem: "rk", body }), ctx.sessionId, s);
    expect(r1.status).toBe(200);
    const d1 = await r1.json();
    const r2 = await handlePostReteach(req("http://t/rt", { cookie: ctx.cookie, idem: "rk", body }), ctx.sessionId, s);
    expect(await r2.json()).toEqual(d1); // replay
    const diff = await handlePostReteach(req("http://t/rt", { cookie: ctx.cookie, idem: "rk", body: { ...body, nextStepHint: "different" } }), ctx.sessionId, s);
    expect(diff.status).toBe(422);
  });

  it("comparison: 404 for a wrong cookie; 409 before comparing; 200 rows when comparing", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const ctx = await toReviewing(s, fake);
    expect((await handleGetComparison(req("http://t/cmp", { method: "GET", cookie: `it_owner_${ctx.sessionId}=deadbeef` }), ctx.sessionId, s)).status).toBe(404);
    const early = await handleGetComparison(req("http://t/cmp", { method: "GET", cookie: ctx.cookie }), ctx.sessionId, s);
    expect(early.status).toBe(409);

    await toComparing(s, fake, ctx);
    const ok = await handleGetComparison(req("http://t/cmp", { method: "GET", cookie: ctx.cookie }), ctx.sessionId, s);
    expect(ok.status).toBe(200);
    const rows = await ok.json();
    expect(rows.find((r: { pairId: string }) => r.pairId === "P1")).toBeTruthy();
  });

  it("reteach + comparison leak no server internals or secrets", async () => {
    const fake = new FakeEvaluator();
    const s = svc(fake);
    const ctx = await toReviewing(s, fake);
    const reteach = await handlePostReteach(req("http://t/rt", { cookie: ctx.cookie, idem: "rk", body: { questionId: "rec.A.P1", nextStepHint: "stop at 0", expectedRevision: ctx.revision } }), ctx.sessionId, s);
    const reteachText = await reteach.text();
    for (const leak of ["ownerTokenHash", "supportsCriterion", "GEMINI", "DATABASE_URL", "postgres://"]) {
      expect(reteachText).not.toContain(leak);
    }
    await toComparing(s, fake, ctx);
    const cmp = await handleGetComparison(req("http://t/cmp", { method: "GET", cookie: ctx.cookie }), ctx.sessionId, s);
    const cmpText = await cmp.text();
    for (const leak of ["answerKey", "supportsCriterion", "ownerTokenHash", "GEMINI", "DATABASE_URL", "postgres://"]) {
      expect(cmpText).not.toContain(leak);
    }
  });
});
