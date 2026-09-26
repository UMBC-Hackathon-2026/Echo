/**
 * Secret scanner (Phase 3 STEP 1). Fails if a tracked file (or, with --staged,
 * a staged file) looks like a committed credential. Never prints any matched
 * value — only the file and which rule fired.
 *
 *   npm run check:secrets            # scans all tracked files (in `verify`, CI)
 *   node ... check-secrets --staged  # scans staged files (pre-commit hook)
 *
 * Rules:
 *  1. A tracked/staged file other than .env.example matching .env*
 *  2. A postgres:// or postgresql:// URL that carries a password (user:pass@)
 *  3. A Google API key pattern (AIza + 35 chars)
 *  4. A file named like tiger-cloud-*-credentials.*
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const staged = process.argv.includes("--staged");
const ALLOW = ".env.example";

const ENV_NAME = /(?:^|\/)\.env(?:\.|$)/; // .env, .env.local, .env.production …
const TIGER_CRED = /tiger-cloud-.*-credentials\./i;
const PG_PASSWORD = /(?:postgres|postgresql):\/\/[^\s:@/]+:[^\s@/]+@/;
const GOOGLE_KEY = /AIza[0-9A-Za-z_-]{35}/;

function list(): string[] {
  const cmd = staged
    ? "git diff --cached --name-only --diff-filter=ACM"
    : "git ls-files";
  return execSync(cmd, { encoding: "utf8" }).split("\n").map((s) => s.trim()).filter(Boolean);
}

function content(file: string): string | null {
  try {
    return staged
      ? execSync(`git show :"${file}"`, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
      : readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

const violations: string[] = [];
const files = list();

for (const file of files) {
  const base = basename(file);

  if (ENV_NAME.test(`/${file}`) && base !== ALLOW) {
    violations.push(`[rule1] env file must not be tracked: ${file}`);
  }
  if (TIGER_CRED.test(base)) {
    violations.push(`[rule4] credentials-named file tracked: ${file}`);
  }

  // Content rules skip the sanctioned template (it documents the URL shape).
  if (base === ALLOW) continue;
  const text = content(file);
  if (text === null) continue;
  if (PG_PASSWORD.test(text)) violations.push(`[rule2] postgres URL with password in: ${file}`);
  if (GOOGLE_KEY.test(text)) violations.push(`[rule3] Google API key pattern in: ${file}`);
}

if (violations.length > 0) {
  console.error(`check:secrets FAILED — ${violations.length} issue(s) (values not shown):`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log(`check:secrets OK — scanned ${files.length} ${staged ? "staged" : "tracked"} file(s); no secrets found.`);
