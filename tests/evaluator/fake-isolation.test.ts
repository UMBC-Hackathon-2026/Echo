import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Production code (lib, app, scripts) must never import the test-only FakeEvaluator. */
function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|mts)$/.test(name)) out.push(full);
  }
  return out;
}

describe("FakeEvaluator isolation", () => {
  it("is not imported by lib/, app/, or scripts/", () => {
    const offenders: string[] = [];
    for (const root of ["lib", "app", "scripts"]) {
      for (const file of walk(root)) {
        const text = readFileSync(file, "utf8");
        if (/fake-evaluator|FakeEvaluator/.test(text)) offenders.push(file);
      }
    }
    expect(offenders, `FakeEvaluator referenced by: ${offenders.join(", ")}`).toEqual([]);
  });
});
