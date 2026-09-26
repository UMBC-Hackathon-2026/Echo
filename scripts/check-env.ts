/**
 * .env.local format + connectivity check (Phase 3 STEP 2). Reads .env.local and
 * reports PASS/FAIL per rule. NEVER prints any value — only present/absent,
 * masked facts, Postgres major version and latency. Excluded from CI (CI has no
 * .env.local). Run: npm run check:env
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";

const PATH = ".env.local";
type Row = { rule: string; ok: boolean; detail: string };
const rows: Row[] = [];
const add = (rule: string, ok: boolean, detail = "") => rows.push({ rule, ok, detail });

let raw: Buffer;
try {
  raw = readFileSync(PATH);
} catch {
  console.error(`check:env FAILED — ${PATH} not found. Copy .env.example to ${PATH} and fill it in.`);
  process.exit(1);
}

// Encoding + line endings.
const hasBOM = raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf;
add("no UTF-8 BOM", !hasBOM, hasBOM ? "BOM present — re-save as UTF-8 without BOM (Notepad adds one)" : "");
const textAll = raw.toString("utf8").replace(/^﻿/, "");
const crlf = /\r\n/.test(textAll);
add("line endings", true, crlf ? "CRLF (fine)" : "LF");

// Parse KEY=value lines.
const env = new Map<string, string>();
const dups: string[] = [];
let formatOk = true;
for (const rawLine of textAll.split(/\r?\n/)) {
  const line = rawLine.replace(/\r$/, "");
  if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
  const eq = line.indexOf("=");
  const key = eq === -1 ? line : line.slice(0, eq);
  const val = eq === -1 ? "" : line.slice(eq + 1);
  if (eq === -1) { formatOk = false; add(`line "${mask(key)}"`, false, "not KEY=value"); continue; }
  if (key.trim() === "") { formatOk = false; add("blank key line", false, "empty variable name"); continue; }
  if (/\s$/.test(key) || val.startsWith(" ")) { add(`${key.trim()} spacing`, false, "space around '='"); formatOk = false; }
  if (/^(['"]).*\1$/.test(val)) { add(`${key.trim()} quotes`, false, "value is quoted"); formatOk = false; }
  if (env.has(key)) dups.push(key);
  env.set(key, val);
}
add("no duplicate keys", dups.length === 0, dups.length ? `duplicates: ${dups.join(", ")}` : "");
add("all lines KEY=value", formatOk);

// Required keys.
for (const k of ["DATABASE_URL", "DATABASE_URL_TEST", "GEMINI_API_KEY"]) {
  add(`${k} present`, env.has(k) && env.get(k)!.length > 0);
}
add("GEMINI_MODEL present (may be blank)", env.has("GEMINI_MODEL"), env.get("GEMINI_MODEL") ? "set" : "blank");

// GEMINI_API_KEY whitespace.
if (env.has("GEMINI_API_KEY")) {
  const v = env.get("GEMINI_API_KEY")!;
  add("GEMINI_API_KEY no surrounding whitespace", v === v.trim() && v.length > 0);
}

// URL validation.
function checkUrl(name: string): { host: string; db: string } | null {
  const v = env.get(name);
  if (!v) return null;
  let u: URL;
  try { u = new URL(v); } catch { add(`${name} parses`, false, "new URL() threw"); return null; }
  add(`${name} parses`, true);
  add(`${name} protocol`, u.protocol === "postgres:" || u.protocol === "postgresql:", u.protocol);
  add(`${name} has username+password`, u.username.length > 0 && u.password.length > 0);
  add(`${name} host present`, u.hostname.length > 0);
  add(`${name} database path present`, u.pathname.replace(/^\//, "").length > 0);
  add(`${name} sslmode=require`, u.searchParams.get("sslmode") === "require");
  return { host: u.hostname, db: u.pathname };
}
const prod = checkUrl("DATABASE_URL");
const test = checkUrl("DATABASE_URL_TEST");
if (prod && test) {
  add("DATABASE_URL_TEST differs from DATABASE_URL", prod.host !== test.host || prod.db !== test.db,
    prod.host === test.host && prod.db === test.db ? "SAME host+db — tests would reset prod!" : "different host or db");
}

function mask(s: string): string {
  return s.length <= 2 ? "**" : `${s[0]}***${s[s.length - 1]}`;
}

async function tls(name: string) {
  const url = env.get(name);
  if (!url) { add(`${name} TLS connect`, false, "missing"); return; }
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
  const t0 = Date.now();
  try {
    await client.connect();
    await client.query("SELECT 1");
    const r = await client.query("SELECT version()");
    const ver = String(r.rows[0].version).match(/PostgreSQL (\d+)/);
    add(`${name} TLS SELECT 1 + version`, true, `Postgres ${ver?.[1] ?? "?"}, ${Date.now() - t0}ms`);
  } catch (e) {
    add(`${name} TLS connect`, false, `${(e as { code?: string }).code ?? "error"} (${Date.now() - t0}ms)`);
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  await tls("DATABASE_URL");
  await tls("DATABASE_URL_TEST");

  let failed = 0;
  for (const r of rows) {
    if (!r.ok) failed++;
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.rule}${r.detail ? `  — ${r.detail}` : ""}`);
  }
  console.log(failed === 0 ? "\ncheck:env OK — all rules passed." : `\ncheck:env FAILED — ${failed} rule(s) failed (no values shown).`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
