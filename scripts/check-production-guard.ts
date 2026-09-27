import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const forbiddenVariables = ["E2E_EVALUATOR", "NEXT_PUBLIC_USE_MOCKS", "DEBUG_LLM_PAYLOADS"];
for (const forbidden of forbiddenVariables) {
  const result = spawnSync(process.execPath, [nextBin, "start"], {
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env, NODE_ENV: "production", [forbidden]: "1" },
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.error || result.status === null || result.status === 0 || result.signal || !output.includes(forbidden)) {
    console.error(`check:prod-guard FAILED — production server did not reject ${forbidden} by name`);
    process.exit(1);
  }
}
console.log(`check:prod-guard OK — production startup rejected ${forbiddenVariables.join(", ")} by name`);
