/**
 * Live evaluator accuracy (Task F). Runs a fixture set through the REAL Gemini
 * adapter + Phase 2 validator, N runs each, and prints per-fixture pass rate,
 * overall pass rate, and over-/under-credit counts (base_case over-credit called
 * out separately — the dangerous direction). Saves a JSON report under reports/
 * (gitignored). Never writes API keys.
 *
 *   npm run eval:live -- tuning 2
 *   npm run eval:live -- heldout 3
 */
import { loadEnvLocal } from "./lib/load-env";
loadEnvLocal();
import { mkdirSync, writeFileSync } from "node:fs";
import { GeminiEvaluator } from "@/lib/evaluator/gemini";
import { scoreFixture } from "@/fixtures/evaluator/score";
import { TUNING_FIXTURES } from "@/fixtures/evaluator/tuning";
import { HELDOUT_FIXTURES } from "@/fixtures/evaluator/heldout";
import type { StudentTurn } from "@/lib/evaluator/provenance";

const setName = process.argv[2] === "heldout" ? "heldout" : "tuning";
const runs = Math.max(1, Number(process.argv[3] ?? 3));
const fixtures = setName === "heldout" ? HELDOUT_FIXTURES : TUNING_FIXTURES;
// Throttle to stay under the provider's requests-per-minute limit.
const DELAY_MS = Math.max(0, Number(process.env.EVAL_DELAY_MS ?? 4000));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const toTurns = (sessionId: string, texts: string[]): StudentTurn[] =>
  texts.map((text, i) => ({ session_id: sessionId, turn_id: `t${i + 1}`, role: "student", text }));

async function main() {
  const ev = new GeminiEvaluator();
  const perFixture: Array<{ id: string; runs: number; pass: number; rate: number; over: string[]; under: string[]; errors: number }> = [];
  const reasons: Record<string, number> = {};
  let scored = 0, passAll = 0, overResults = 0, underResults = 0, baseOver = 0, errors = 0, first = true;

  for (const fx of fixtures) {
    let pass = 0, fxErr = 0;
    const over = new Set<string>(), under = new Set<string>();
    for (let r = 0; r < runs; r++) {
      if (!first) await sleep(DELAY_MS);
      first = false;
      const sessionId = `${fx.id}-${r}`;
      const res = await ev.evaluate({ sessionId, turns: toTurns(sessionId, fx.turns) });
      if (!res.ok) { errors++; fxErr++; reasons[res.reason] = (reasons[res.reason] ?? 0) + 1; continue; }
      scored++;
      const sc = scoreFixture(res.evaluation, fx);
      if (sc.pass) { pass++; passAll++; }
      if (sc.overCredit.length) { overResults++; sc.overCredit.forEach((c) => over.add(c)); if (sc.overCredit.includes("base_case")) baseOver++; }
      if (sc.underCredit.length) { underResults++; sc.underCredit.forEach((c) => under.add(c)); }
    }
    const rate = pass / runs;
    perFixture.push({ id: fx.id, runs, pass, rate, over: [...over], under: [...under], errors: fxErr });
    console.log(`${rate.toFixed(2)}  ${fx.id.padEnd(22)} over=[${[...over].join(",")}] under=[${[...under].join(",")}]${fxErr ? ` errors=${fxErr}` : ""}`);
  }

  console.log(`\nset=${setName} runs/fixture=${runs} fixtures=${fixtures.length}`);
  const denom = scored || 1;
  console.log(`overall pass rate: ${((passAll / denom) * 100).toFixed(1)}% (${passAll}/${scored} scored; ${errors} adapter errors)`);
  console.log(`over-credit results: ${overResults}  (base_case over-credits: ${baseOver})`);
  console.log(`under-credit results: ${underResults}`);
  if (errors) console.log(`error reasons: ${JSON.stringify(reasons)}`);

  mkdirSync("reports", { recursive: true });
  const file = `reports/eval-${setName}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify({ set: setName, runs, perFixture, scored, passAll, errors, overResults, underResults, baseOver }, null, 2));
  console.log(`saved ${file}`);
}

void main();
