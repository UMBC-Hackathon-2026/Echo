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

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";

async function main() {
  let cookie = "";
  const call = async (path: string, method: string, body?: unknown, idem?: string) => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (cookie) headers.cookie = cookie;
    if (idem) headers["idempotency-key"] = idem;
    const res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
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
    if (student?.evalStatus !== "evaluated") { console.log(`BLOCKED: evaluation ${student?.evalStatus} (likely quota/429).`); return; }
    const record = teach.body.record as { concepts: Record<string, { state: string }> };
    console.log(`base_case=${record.concepts.base_case.state} (expect not demonstrated)`);
    console.log(`probe=${msgs.filter((m) => m.role === "learner").at(-1)?.probeId ?? "none"}`);

    const att = await call(`/api/sessions/${sessionId}/attempts`, "POST", { expectedRevision: teach.body.revision }, "smoke-attempt");
    const attempt = (att.body.attempts as Array<{ id: string; results: Array<{ questionId: string; outcome: string; blocking: unknown }> }>)[0];
    const p1 = attempt.results.find((r) => r.questionId === "rec.A.P1");
    console.log(`P1 outcome=${p1?.outcome} blocking=${JSON.stringify(p1?.blocking)}`);

    const done = await call(`/api/attempts/${attempt.id}/complete`, "POST", { sessionId, expectedRevision: att.body.revision }, "smoke-complete");
    console.log(`complete status=${done.status} phase=${done.body.phase}`);
    const reload = await call(`/api/sessions/${sessionId}`, "GET");
    console.log(`reload identical=${JSON.stringify(reload.body) === JSON.stringify(done.body)}`);

    const dup = await call(`/api/sessions/${sessionId}/attempts`, "POST", { expectedRevision: teach.body.revision }, "smoke-attempt");
    console.log(`duplicate attempt replay status=${dup.status} (no new row expected)`);
  } finally {
    await getPool().query("DELETE FROM sessions WHERE id = $1", [sessionId]);
    console.log(`deleted smoke session ${sessionId}`);
    await getPool().end().catch(() => {});
  }
}

void main();
