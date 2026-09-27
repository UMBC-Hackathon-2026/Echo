/**
 * Live service smoke test (Task B, gate 14). Drives the service layer directly
 * with the real Gemini adapter and the dev DATABASE_URL: create -> teach cycle 1
 * -> assert base_case not demonstrated + probe -> attempt -> assert termination
 * outcome/blocking -> complete -> reload and compare. Deletes the smoke session.
 *
 *   npm run smoke:service
 */
import { loadEnvLocal } from "./lib/load-env";
loadEnvLocal();
import { GeminiEvaluator } from "@/lib/evaluator/gemini";
import { createSessionService } from "@/lib/session/service";
import { getPool } from "@/lib/db/client";
import assert from "node:assert/strict";

let calls = 0;

async function main() {
  console.log("Planned: at most 1 Gemini call (no retries).");
  const evaluator = new GeminiEvaluator({ maxAttempts: 1 });
  const service = createSessionService({ evaluator: { async evaluate(args) {
    assert.equal(calls, 0, "service smoke call budget exhausted");
    const result = await evaluator.evaluate(args);
    calls += result.attempts;
    console.log(`evaluation ${result.ok ? "success" : result.reason}; model=${process.env.GEMINI_MODEL}; latency=${result.ok ? result.latencyMs : "unavailable"}ms`);
    return result;
  } } });
  const created = await service.createSession({});
  const { sessionId, ownerToken } = created;
  console.log(`session ${sessionId} phase=${created.dto.phase}`);

  try {
    let s = await service.submitTeaching({
      sessionId, ownerToken,
      text: "A function is recursive when it calls itself, and each call works on a smaller n.",
      expectedRevision: created.dto.revision, idempotencyKey: "smoke-teach",
    });
    const student = s.messages.find((m) => m.role === "student");
    console.log(`teach eval status: ${student?.evalStatus}`);
    assert.equal(student?.evalStatus, "evaluated", "evaluation must succeed");
    assert.notEqual(s.record.concepts.base_case.state, "demonstrated", "evaluator over-credit: base_case");
    console.log(`base_case state: ${s.record.concepts.base_case.state} (expect not demonstrated)`);
    const probe = s.messages.filter((m) => m.role === "learner").at(-1);
    assert.ok(probe?.probeId, "missing learner probe");
    console.log(`probe: ${probe?.probeId ?? "none"} — "${probe?.content ?? ""}"`);

    s = await service.createAttempt({ sessionId, ownerToken, expectedRevision: s.revision, idempotencyKey: "smoke-attempt" });
    const p1 = s.attempts[0].results.find((r) => r.questionId === "rec.A.P1");
    assert.ok(p1 && ["misconception", "partial"].includes(p1.outcome), "unexpected termination outcome");
    assert.ok(p1.blocking.concepts.includes("base_case"), "base_case must block P1");
    console.log(`P1 outcome=${p1?.outcome} blocking=${JSON.stringify(p1?.blocking)}`);

    const attemptId = s.attempts[0].id;
    s = await service.completeAttempt({ sessionId, ownerToken, attemptId, expectedRevision: s.revision, idempotencyKey: "smoke-complete" });
    console.log(`phase after complete: ${s.phase}`);

    const reload = await service.getSessionState({ sessionId, ownerToken });
    assert.equal(s.phase, "reviewing");
    assert.deepEqual(reload, s, "reload must preserve the completed state");
    console.log(`reload identical: ${JSON.stringify(reload) === JSON.stringify(s)}`);
  } finally {
    try {
      await getPool().query("DELETE FROM sessions WHERE id = $1", [sessionId]);
      console.log(`deleted smoke session ${sessionId}`);
    } finally { await getPool().end(); }
  }
}

void main().catch(() => {
  console.error("FAIL: service smoke did not satisfy its assertions or cleanup. See step statuses above.");
  process.exitCode = 1;
}).finally(() => console.log(`Gemini calls: ${calls}`));
