/**
 * Post-build leak check (ARCHITECTURE_REVISED §4; Phase 1 gate item 4/6).
 * Scans the production client bundle under .next/static for material that must
 * never ship: answer-key / fragment substrings, Gemini/ElevenLabs secret key
 * names, and the dev-only mock sentinel. Exits non-zero if any are found.
 *
 * Run AFTER `npm run build`.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";

const STATIC_DIR = join(process.cwd(), ".next", "static");
const SERVER_DIR = join(process.cwd(), ".next", "server");
const TEXT_EXTS = new Set([".js", ".mjs", ".css", ".html", ".json", ".map", ".txt"]);

// The scripted E2E evaluator must never ship — not to the client, and not even
// to the server build (it is behind a guarded, dead-code-eliminated import).
const SCRIPTED_SENTINEL = "SCRIPTED_EVALUATOR_SENTINEL_do_not_ship";

// Distinctive strings taken verbatim from server-only content + the dev sentinel.
const FORBIDDEN: Array<{ label: string; needle: string }> = [
  { label: "answer-key/fragment text", needle: "the if-check returns without calling again" },
  { label: "answer-key/fragment text", needle: "3 * 2 * 1 * 1 = 6" },
  { label: "answer-key/fragment text", needle: "keeps going forever" },
  { label: "secret key name", needle: "GEMINI" },
  { label: "secret key name", needle: "ELEVENLABS" },
  { label: "dev mock sentinel", needle: "DEV_MOCK_SENTINEL_do_not_ship" },
  { label: "scripted evaluator sentinel", needle: SCRIPTED_SENTINEL },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (TEXT_EXTS.has(extname(entry.name))) out.push(full);
  }
  return out;
}

if (!existsSync(STATIC_DIR)) {
  console.error(`check:bundle FAILED — ${STATIC_DIR} not found. Run \`npm run build\` first.`);
  process.exit(1);
}

const files = walk(STATIC_DIR);
const hits: string[] = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const { label, needle } of FORBIDDEN) {
    if (text.includes(needle)) hits.push(`${label} "${needle}" found in ${relative(process.cwd(), file)}`);
  }
}

// The server build legitimately holds secret names and answer keys, so only the
// scripted-evaluator sentinel is forbidden there — proving the guarded import
// never bundled it.
let serverFiles: string[] = [];
if (existsSync(SERVER_DIR)) {
  serverFiles = walk(SERVER_DIR);
  for (const file of serverFiles) {
    if (readFileSync(file, "utf8").includes(SCRIPTED_SENTINEL)) {
      hits.push(`scripted evaluator sentinel "${SCRIPTED_SENTINEL}" found in ${relative(process.cwd(), file)}`);
    }
  }
}

if (hits.length > 0) {
  console.error(`check:bundle FAILED — ${hits.length} leak(s) in production build:`);
  for (const h of hits) console.error(`  - ${h}`);
  process.exit(1);
}

console.log(`check:bundle OK — scanned ${files.length} client + ${serverFiles.length} server files; no answer keys, secrets, dev mocks, or scripted evaluator.`);
