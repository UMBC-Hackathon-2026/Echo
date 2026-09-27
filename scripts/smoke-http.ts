/**
 * HTTP smoke test (Phase 3 gate 12). Runs against a RUNNING app
 * (npm run build && npm start) with real Gemini and the dev DATABASE_URL:
 * create -> teach cycle 1 -> base_case not demonstrated + probe -> attempt
 * (termination misconception/partial, base_case blocking) -> complete -> GET
 * identical -> duplicate POST makes no new row. Cleans up the session.
 *
 *   SMOKE_BASE=http://localhost:3000 npm run smoke:http
 */
import { loadEnvLocal } from "./lib/load-env";
loadEnvLocal();
import { getPool } from "@/lib/db/client";
import assert from "node:assert/strict";

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";

async function main() {
  console.log("Planned: at most 2 Gemini calls (one teaching submission, up to two provider attempts).");
  let cookie = "";
  const call = async (path: string, method: string, body?: unknown, idem?: string) => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (cookie) headers.cookie = cookie;
    if (idem) headers["idempotency-key"] = idem;
    const res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    assert.ok(res.ok, `HTTP ${method} request failed with status ${res.status}`);
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = [cookie, setCookie.split(";")[0]].filter(Boolean).join("; ");
    return { status: res.status, body: await res.json().catch(() => ({})) as Record<string, unknown> };
  };

  const created = await call("/api/sessions", "POST", {});
  const sessionId = created.body.sessionId as string;
  console.log(`session ${sessionId} status=${created.status}`);

  try {
    const teach = await call(`/api/sessions/${sessionId}/messages`, "POST", { text: "A function is recursive when it calls itself, and each call works on a smaller n.", expectedRevision: created.body.revision }, "smoke-teach");
    const msgs = teach.body.messages as Array<{ role: string; evalStatus: string; probeId?: string }>;
    const student = msgs.find((m) => m.role === "student");
    console.log(`teach status=${teach.status} eval=${student?.evalStatus}`);
    assert.equal(student?.evalStatus, "evaluated", "evaluation must succeed");
    const record = teach.body.record as { concepts: Record<string, { state: string }> };
    assert.notEqual(record.concepts.base_case.state, "demonstrated", "evaluator over-credit: base_case");
    assert.ok(msgs.filter((m) => m.role === "learner").at(-1)?.probeId, "missing learner probe");
    console.log(`base_case=${record.concepts.base_case.state} (expect not demonstrated)`);
    console.log(`probe=${msgs.filter((m) => m.role === "learner").at(-1)?.probeId ?? "none"}`);

    const att = await call(`/api/sessions/${sessionId}/attempts`, "POST", { expectedRevision: teach.body.revision }, "smoke-attempt");
    const attempt = (att.body.attempts as Array<{ id: string; results: Array<{ questionId: string; outcome: string; blocking: { concepts: string[] } }> }>)[0];
    const p1 = attempt.results.find((r) => r.questionId === "rec.A.P1");
    assert.ok(p1 && ["misconception", "partial"].includes(p1.outcome), "unexpected termination outcome");
    assert.ok(p1.blocking.concepts.includes("base_case"), "base_case must block P1");
    console.log(`P1 outcome=${p1?.outcome} blocking=${JSON.stringify(p1?.blocking)}`);

    const done = await call(`/api/attempts/${attempt.id}/complete`, "POST", { sessionId, expectedRevision: att.body.revision }, "smoke-complete");
    console.log(`complete status=${done.status} phase=${done.body.phase}`);
    const reload = await call(`/api/sessions/${sessionId}`, "GET");
    assert.equal(done.body.phase, "reviewing");
    assert.deepEqual(reload.body, done.body, "reload must preserve the completed state");
    console.log(`reload identical=${JSON.stringify(reload.body) === JSON.stringify(done.body)}`);

    const dup = await call(`/api/sessions/${sessionId}/attempts`, "POST", { expectedRevision: teach.body.revision }, "smoke-attempt");
    assert.deepEqual(dup.body, att.body, "idempotent replay must return the original response");
    const rows = await getPool().query("SELECT count(*)::int AS count FROM assessment_attempts WHERE session_id = $1", [sessionId]);
    assert.equal(rows.rows[0].count, 1, "idempotent replay must not create another attempt");
    console.log(`duplicate attempt replay status=${dup.status} (no new row expected)`);
  } finally {
    try {
      await getPool().query("DELETE FROM sessions WHERE id = $1", [sessionId]);
      console.log(`deleted smoke session ${sessionId}`);
    } finally { await getPool().end(); }
  }
}

void main().catch(() => {
  console.error("FAIL: HTTP smoke did not satisfy its assertions or cleanup. See step statuses above.");
  process.exitCode = 1;
});
