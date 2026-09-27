import { spawnSync } from "node:child_process";

const forbiddenVariables = ["E2E_EVALUATOR", "NEXT_PUBLIC_USE_MOCKS", "DEBUG_LLM_PAYLOADS"];
for (const forbidden of forbiddenVariables) {
  const result = spawnSync("npm", ["start"], {
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env, NODE_ENV: "production", [forbidden]: "1" },
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status === 0 || result.signal || !output.includes(forbidden)) {
    console.error(`check:prod-guard FAILED — production server did not reject ${forbidden} by name`);
    process.exit(1);
  }
}
console.log(`check:prod-guard OK — production startup rejected ${forbiddenVariables.join(", ")} by name`);
