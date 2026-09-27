import type { NextConfig } from "next";

const forbiddenProductionVariables = ["E2E_EVALUATOR", "NEXT_PUBLIC_USE_MOCKS", "DEBUG_LLM_PAYLOADS"] as const;
if (process.env.NODE_ENV === "production") {
  const forbidden = forbiddenProductionVariables.find((name) => process.env[name] !== undefined);
  if (forbidden) throw new Error(`Production startup refused: forbidden environment variable ${forbidden} is set.`);
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
