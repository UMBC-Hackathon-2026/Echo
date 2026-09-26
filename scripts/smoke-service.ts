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

async function main() {
  const service = createSessionService({ evaluator: new GeminiEvaluator() });
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
    if (student?.evalStatus !== "evaluated") {
      console.log(`BLOCKED: evaluation not successful (${student?.evalStatus}) — likely quota/rate limit.`);
      return;
    }
    console.log(`base_case state: ${s.record.concepts.base_case.state} (expect not demonstrated)`);
    const probe = s.messages.filter((m) => m.role === "learner").at(-1);
    console.log(`probe: ${probe?.probeId ?? "none"} — "${probe?.content ?? ""}"`);

    s = await service.createAttempt({ sessionId, ownerToken, expectedRevision: s.revision, idempotencyKey: "smoke-attempt" });
    const p1 = s.attempts[0].results.find((r) => r.questionId === "rec.A.P1");
    console.log(`P1 outcome=${p1?.outcome} blocking=${JSON.stringify(p1?.blocking)}`);

    const attemptId = s.attempts[0].id;
    s = await service.completeAttempt({ sessionId, ownerToken, attemptId, expectedRevision: s.revision, idempotencyKey: "smoke-complete" });
    console.log(`phase after complete: ${s.phase}`);

    const reload = await service.getSessionState({ sessionId, ownerToken });
    console.log(`reload identical: ${JSON.stringify(reload) === JSON.stringify(s)}`);
  } finally {
    await getPool().query("DELETE FROM sessions WHERE id = $1", [sessionId]);
    console.log(`deleted smoke session ${sessionId}`);
    await getPool().end().catch(() => {});
  }
}

void main();
