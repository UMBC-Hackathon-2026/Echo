import "server-only";
import { GoogleGenAI } from "@google/genai";
import { validateEvaluation, type ValidatedEvaluation } from "./validate";
import { buildSystemInstruction, buildUserText, RESPONSE_SCHEMA } from "./prompt";
import { runWithBudget, type AttemptOutcome } from "./budget";
import type { Evaluator, EvaluateArgs, EvaluationResult } from "./evaluator";
import { maybeWriteDebugPayload } from "./debug";

/** One bounded teach call: 20 s wall clock, at most 2 attempts (§4, §7). */
const TOTAL_MS = 20_000;
const MAX_ATTEMPTS = 2;

export interface GeminiEvaluatorOptions {
  apiKey?: string;
  model?: string;
}

export class GeminiEvaluator implements Evaluator {
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor(opts: GeminiEvaluatorOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    this.model = opts.model ?? process.env.GEMINI_MODEL ?? "";
    if (!this.model) throw new Error("GEMINI_MODEL is not set");
    // Disable the SDK's own retries; runWithBudget is the only retry layer.
    this.ai = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
  }

  async evaluate({ sessionId, turns, signal }: EvaluateArgs): Promise<EvaluationResult> {
    const systemInstruction = buildSystemInstruction();
    const userText = buildUserText(turns);
    const started = Date.now();

    const callOnce = async ({ remainingMs }: { remainingMs: number }): Promise<AttemptOutcome<ValidatedEvaluation>> => {
      const ac = new AbortController();
      const onAbort = () => ac.abort();
      if (signal) {
        if (signal.aborted) ac.abort();
        else signal.addEventListener("abort", onAbort, { once: true });
      }
      const timer = setTimeout(() => ac.abort(), Math.max(0, remainingMs));
      let text: string | undefined;
      try {
        const resp = await this.ai.models.generateContent({
          model: this.model,
          contents: userText,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseJsonSchema: RESPONSE_SCHEMA,
            temperature: 0,
            abortSignal: ac.signal,
          },
        });
        text = resp.text;
      } catch (e) {
        if (ac.signal.aborted) return { ok: false, reason: "timeout" };
        const status = (e as { status?: number }).status;
        if (status === 429 || status === 503) {
          return { ok: false, reason: "rate_limited", retryAfterMs: retryAfterMsFrom(e) };
        }
        return { ok: false, reason: "provider_error" };
      } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", onAbort);
      }

      await maybeWriteDebugPayload({ sessionId, raw: text });
      if (!text) return { ok: false, reason: "invalid_output" };
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return { ok: false, reason: "invalid_output" };
      }
      try {
        return { ok: true, value: validateEvaluation(parsed, { sessionId, turns }) };
      } catch {
        return { ok: false, reason: "invalid_output" };
      }
    };

    const result = await runWithBudget<ValidatedEvaluation>(callOnce, {
      totalMs: TOTAL_MS,
      maxAttempts: MAX_ATTEMPTS,
    });
    if (result.ok) {
      return { ok: true, evaluation: result.value, model: this.model, latencyMs: Date.now() - started, attempts: result.attempts };
    }
    return { ok: false, reason: result.reason, attempts: result.attempts };
  }
}

function retryAfterMsFrom(e: unknown): number | undefined {
  const headers = (e as { headers?: Record<string, string> }).headers;
  const raw = headers?.["retry-after"] ?? headers?.["Retry-After"];
  if (!raw) return undefined;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return secs * 1000;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}
