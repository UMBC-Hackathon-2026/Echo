import { readFileSync } from "node:fs";

/**
 * Minimal .env.local loader for standalone scripts (Next loads it for the app,
 * but tsx scripts do not). Only sets keys that are not already in the
 * environment. Never logs values.
 */
export function loadEnvLocal(path = ".env.local"): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8").replace(/^﻿/, "");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1);
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}
