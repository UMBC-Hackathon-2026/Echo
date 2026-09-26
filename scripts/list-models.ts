/**
 * List available Gemini models and their supported actions (Task C). Reads
 * GEMINI_API_KEY from .env.local; prints only model names/actions, no key.
 */
import { loadEnvLocal } from "./lib/load-env";
loadEnvLocal();
import { GoogleGenAI } from "@google/genai";

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY not set");
    process.exit(1);
  }
  const ai = new GoogleGenAI({ apiKey });
  const pager = await ai.models.list();
  const rows: Array<{ name: string; actions: string }> = [];
  for await (const m of pager) {
    rows.push({ name: m.name ?? "?", actions: (m.supportedActions ?? []).join(",") });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  for (const r of rows) console.log(`${r.name}\t[${r.actions}]`);
  console.log(`\n${rows.length} models`);
}

void main();
