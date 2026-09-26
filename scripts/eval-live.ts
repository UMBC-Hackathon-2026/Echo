/**
 * Live evaluator accuracy (Task F / Phase 3c). Runs a fixture set through the
 * REAL Gemini adapter + Phase 2 validator, N runs each. Prints per-fixture pass
 * rate, overall pass rate, and over-/under-credit counts (base_case over-credit
 * called out separately). Saves a JSON report under reports/ (gitignored).
 *
 * Quota-aware:
 *   --runs N           runs per fixture (default 3)
 *   --only a,b,c       only these fixture ids
 *   --resume           reuse the latest reports/eval-<set>-*.json (skip completed runs)
 *   first positional   set: tuning | heldout (default tuning)
 * On a 429 / quota response it STOPS gracefully, saves partial results, and
 * exits non-zero. It never retries through a quota error and never prints keys.
 *
 *   npm run eval:live -- heldout --runs 3
 *   npm run eval:live -- heldout --runs 3 --resume
 */
import { loadEnvLocal } from "./lib/load-env";
loadEnvLocal();
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GeminiEvaluator } from "@/lib/evaluator/gemini";
import { scoreFixture } from "@/fixtures/evaluator/score";
import { TUNING_FIXTURES } from "@/fixtures/evaluator/tuning";
import { HELDOUT_FIXTURES } from "@/fixtures/evaluator/heldout";
import type { StudentTurn } from "@/lib/evaluator/provenance";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const setName = args.find((a) => a === "tuning" || a === "heldout") ?? "tuning";
const runs = Math.max(1, Number(flag("runs") ?? 3));
const only = flag("only")?.split(",").map((s) => s.trim()).filter(Boolean);
const resume = args.includes("--resume");
const DELAY_MS = Math.max(0, Number(process.env.EVAL_DELAY_MS ?? 4000));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let fixtures = setName === "heldout" ? HELDOUT_FIXTURES : TUNING_FIXTURES;
if (only) fixtures = fixtures.filter((f) => only.includes(f.id));

interface FixtureAgg { id: string; pass: number; scored: number; over: string[]; under: string[]; errors: number }
const agg = new Map<string, FixtureAgg>();
for (const f of fixtures) agg.set(f.id, { id: f.id, pass: 0, scored: 0, over: [], under: [], errors: 0 });

// --resume: seed from the most recent report for this set.
if (resume) {
  try {
    const files = readdirSync("reports").filter((f) => f.startsWith(`eval-${setName}-`)).sort();
    const latest = files.at(-1);
    if (latest) {
      const prev = JSON.parse(readFileSync(join("reports", latest), "utf8"));
      for (const p of prev.perFixture ?? []) {
        const a = agg.get(p.id);
        if (a) { a.pass = p.pass ?? 0; a.scored = p.scored ?? p.runs - (p.errors ?? 0); a.over = p.over ?? []; a.under = p.under ?? []; a.errors = p.errors ?? 0; }
      }
      console.log(`resumed from reports/${latest}`);
    }
  } catch { /* no prior report */ }
}

const toTurns = (sessionId: string, texts: string[]): StudentTurn[] =>
  texts.map((text, i) => ({ session_id: sessionId, turn_id: `t${i + 1}`, role: "student", text }));

function save(stopped: boolean) {
  mkdirSync("reports", { recursive: true });
  const perFixture = [...agg.values()].map((a) => ({
    id: a.id, runs, scored: a.scored, pass: a.pass, rate: a.scored ? a.pass / a.scored : 0,
    over: [...new Set(a.over)], under: [...new Set(a.under)], errors: a.errors,
  }));
  const scored = perFixture.reduce((n, p) => n + p.scored, 0);
  const passAll = perFixture.reduce((n, p) => n + p.pass, 0);
  const file = `reports/eval-${setName}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify({ set: setName, runs, stopped, perFixture, scored, passAll }, null, 2));
  return { file, scored, passAll, perFixture };
}

async function main() {
  const ev = new GeminiEvaluator();
  let calls = 0, first = true, stopped = false;

  outer: for (const fx of fixtures) {
    const a = agg.get(fx.id)!;
    const done = a.scored + a.errors; // runs already accounted this fixture (resume)
    for (let r = done; r < runs; r++) {
      if (!first) await sleep(DELAY_MS);
      first = false;
      calls++;
      const sessionId = `${fx.id}-${r}`;
      const res = await ev.evaluate({ sessionId, turns: toTurns(sessionId, fx.turns) });
      if (!res.ok) {
        if (res.reason === "rate_limited") {
          console.error(`\nSTOPPED after ${calls} call(s): rate_limited / quota. Saving partial results.`);
          stopped = true;
          break outer;
        }
        a.errors++;
        continue;
      }
      a.scored++;
      const sc = scoreFixture(res.evaluation, fx);
      if (sc.pass) a.pass++;
      if (sc.overCredit.length) a.over.push(...sc.overCredit);
      if (sc.underCredit.length) a.under.push(...sc.underCredit);
      process.stdout.write(`\r[${calls}] ${fx.id} pass=${a.pass}/${a.scored}     `);
    }
  }
  process.stdout.write("\n");

  const { file, scored, passAll, perFixture } = save(stopped);
  for (const p of perFixture) console.log(`${p.rate.toFixed(2)}  ${p.id.padEnd(22)} over=[${p.over.join(",")}] under=[${p.under.join(",")}]${p.errors ? ` err=${p.errors}` : ""}`);
  const over = perFixture.reduce((n, p) => n + p.over.length, 0);
  const under = perFixture.reduce((n, p) => n + p.under.length, 0);
  const baseOver = perFixture.filter((p) => p.over.includes("base_case")).length;
  console.log(`\nset=${setName} runs=${runs} calls=${calls} overall=${scored ? ((passAll / scored) * 100).toFixed(1) : "0"}% (${passAll}/${scored})`);
  console.log(`over-credit fixtures: ${over} (base_case: ${baseOver}); under-credit fixtures: ${under}`);
  console.log(`saved ${file}`);
  process.exit(stopped ? 1 : 0);
}

void main();
