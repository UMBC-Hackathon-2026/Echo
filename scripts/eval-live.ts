import { defaultTopic } from "../tests/helpers/phase2";
/**
 * Live evaluator accuracy (Task F / Phase 3c). Runs a fixture set through the
 * REAL Gemini adapter + Phase 2 validator, N runs each. Prints per-fixture pass
 * rate, overall pass rate, and over-/under-credit counts (base_case over-credit
 * called out separately). Saves a JSON report under reports/ (gitignored).
 *
 * Quota-aware:
 *   --runs N           runs per fixture (default 3)
 *   --only a,b,c       only these fixture ids
 *   --max-calls N      provider-call cap including retries (default 150)
 *   --max-attempts N   provider calls per evaluation, 1 or 2 (default 1)
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
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PROMPT_VERSION } from "@/lib/evaluator/prompt";
import type { ConceptId, ConceptState } from "@/lib/contracts";
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
const runs = Number(flag("runs") ?? 3);
const maxCalls = Number(flag("max-calls") ?? 150);
const maxAttempts = Number(flag("max-attempts") ?? 1);
if (![1, 2].includes(maxAttempts)) throw new Error("--max-attempts must be 1 or 2");
const model = process.env.GEMINI_MODEL;
// Version labels alone cannot identify rubric/schema/fixture changes.
const evidenceFiles = execFileSync("git", ["ls-files", "-z", "lib/evaluator", "lib/content", "lib/contracts", "fixtures/evaluator"], { encoding: "utf8" }).split("\0").filter(Boolean).sort();
const hash = createHash("sha256");
for (const file of evidenceFiles) hash.update(file).update("\0").update(readFileSync(file)).update("\0");
const evidenceFingerprint = hash.digest("hex");
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!Number.isSafeInteger(runs) || runs < 1 || !Number.isSafeInteger(maxCalls) || maxCalls < 0) {
  throw new Error("--runs must be a positive integer; --max-calls must be a nonnegative integer");
}
let calls = 0;
let previousCalls = 0;
interface Sample {
  id: string; run: number; calls: number; error?: string;
  states?: Record<ConceptId, ConceptState>;
  expected?: Record<ConceptId, ConceptState[]>;
  pass?: boolean; overCredit?: ConceptId[]; underCredit?: ConceptId[];
}
const samples: Sample[] = [];
const only = flag("only")?.split(",").map((s) => s.trim()).filter(Boolean);
const resume = args.includes("--resume");
const DELAY_MS = Math.max(0, Number(process.env.EVAL_DELAY_MS ?? 5000));
if (!Number.isFinite(DELAY_MS)) throw new Error("EVAL_DELAY_MS must be finite");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let fixtures = setName === "heldout" ? HELDOUT_FIXTURES : TUNING_FIXTURES;
if (only) fixtures = fixtures.filter((f) => only.includes(f.id));
if (!fixtures.length || only?.some((id) => !fixtures.some((f) => f.id === id))) throw new Error("--only contains an unknown fixture");
const reportFile = `reports/eval-${setName}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

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
      if (prev.promptVersion !== PROMPT_VERSION) throw new Error("Cannot resume a different prompt version");
      if (prev.model !== model) throw new Error("Cannot resume a different model");
      if (prev.evidenceFingerprint !== evidenceFingerprint) throw new Error("Cannot resume changed or unidentified evaluator/rubric/fixtures; start a fresh run");
      if (prev.runs !== runs || JSON.stringify(prev.perFixture.map((p: { id: string }) => p.id)) !== JSON.stringify(fixtures.map((f) => f.id))) throw new Error("Resume requires the same run count and fixture selection");
      previousCalls = prev.totalCalls ?? prev.calls ?? 0;
      samples.push(...(prev.samples ?? []));
      for (const p of prev.perFixture ?? []) {
        const a = agg.get(p.id);
        if (a) { a.pass = p.pass ?? 0; a.scored = p.scored ?? p.runs - (p.errors ?? 0); a.over = p.over ?? []; a.under = p.under ?? []; a.errors = p.errors ?? 0; }
      }
      console.log(`resumed from reports/${latest}`);
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}

const toTurns = (sessionId: string, texts: string[]): StudentTurn[] =>
  texts.map((text, i) => ({ session_id: sessionId, turn_id: `t${i + 1}`, role: "student", text }));

function save(stopped: boolean, stopReason?: string) {
  mkdirSync("reports", { recursive: true });
  const perFixture = [...agg.values()].map((a) => ({
    id: a.id, runs, scored: a.scored, pass: a.pass, rate: a.scored ? a.pass / a.scored : 0,
    over: [...new Set(a.over)], under: [...new Set(a.under)], errors: a.errors,
  }));
  const scored = perFixture.reduce((n, p) => n + p.scored, 0);
  const passAll = perFixture.reduce((n, p) => n + p.pass, 0);
  const file = reportFile;
  const complete = scored === fixtures.length * runs;
  const overCreditCount = samples.reduce((n, s) => n + (s.overCredit?.length ?? 0), 0);
  const underCreditCount = samples.reduce((n, s) => n + (s.underCredit?.length ?? 0), 0);
  writeFileSync(file, JSON.stringify({ set: setName, commit, evidenceFingerprint, promptVersion: PROMPT_VERSION, model, runs, maxCalls, maxAttempts, delayMs: DELAY_MS, calls, totalCalls: previousCalls + calls, stopped, stopReason, complete, overCreditCount, underCreditCount, samples, perFixture, scored, passAll }, null, 2));
  return { file, scored, passAll, perFixture };
}

async function main() {
  let first = true, stopped = false;
  let stopReason: string | undefined;
  const pending = [...agg.values()].reduce((n, a) => n + Math.max(0, runs - a.scored - a.errors), 0);
  console.log(`Planned: ${pending} evaluations; at most ${Math.min(maxCalls, pending * maxAttempts)} Gemini calls including retries (cap=${maxCalls}).`);

  outer: for (const fx of fixtures) {
    const a = agg.get(fx.id)!;
    const done = a.scored + a.errors; // runs already accounted this fixture (resume)
    for (let r = done; r < runs; r++) {
      if (calls >= maxCalls) {
        stopped = true;
        stopReason = "max_calls";
        break outer;
      }
      if (!first) await sleep(DELAY_MS);
      first = false;
      const ev = new GeminiEvaluator({ maxAttempts: Math.min(maxAttempts, maxCalls - calls) });
      const sessionId = `${fx.id}-${r}`;
      const res = await ev.evaluate({ sessionId, turns: toTurns(sessionId, fx.turns), topic: defaultTopic });
      calls += res.attempts;
      const sample: Sample = { id: fx.id, run: r + 1, calls: res.attempts };
      samples.push(sample);
      if (!res.ok) {
        sample.error = res.reason;
        if (res.reason === "rate_limited") {
          console.error(`\nSTOPPED after ${calls} call(s): rate_limited / quota. Saving partial results.`);
          stopped = true;
          stopReason = "rate_limited";
          break outer;
        }
        a.errors++;
        save(true, "in_progress");
        continue;
      }
      a.scored++;
      const sc = scoreFixture(res.evaluation, fx);
      Object.assign(sample, sc, { expected: fx.expect,
        states: Object.fromEntries(Object.entries(res.evaluation.concepts).map(([id, c]) => [id, c.state])),
      });
      if (sc.pass) a.pass++;
      if (sc.overCredit.length) a.over.push(...sc.overCredit);
      if (sc.underCredit.length) a.under.push(...sc.underCredit);
      save(true, "in_progress");
      process.stdout.write(`\n[${calls}] ${fx.id} pass=${a.pass}/${a.scored}     `);
    }
  }
  process.stdout.write("\n");

  const { file, scored, passAll, perFixture } = save(stopped, stopReason);
  for (const p of perFixture) console.log(`${p.rate.toFixed(2)}  ${p.id.padEnd(22)} over=[${p.over.join(",")}] under=[${p.under.join(",")}]${p.errors ? ` err=${p.errors}` : ""}`);
  const over = perFixture.reduce((n, p) => n + p.over.length, 0);
  const under = perFixture.reduce((n, p) => n + p.under.length, 0);
  const baseOver = perFixture.filter((p) => p.over.includes("base_case")).length;
  console.log(`\nset=${setName} runs=${runs} calls=${calls} overall=${scored ? ((passAll / scored) * 100).toFixed(1) : "0"}% (${passAll}/${scored})`);
  console.log(`over-credit fixtures: ${over} (base_case: ${baseOver}); under-credit fixtures: ${under}`);
  console.log(`saved ${file}`);
  console.log(`coverage=${scored}/${fixtures.length * runs}; ${stopped ? `INCOMPLETE (${stopReason})` : "finished"}`);
  process.exit((stopped && stopReason !== "max_calls") || passAll !== scored || perFixture.some((p) => p.errors > 0) ? 1 : 0);
}

void main();
