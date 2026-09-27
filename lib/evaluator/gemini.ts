import "server-only";
import { GoogleGenAI } from "@google/genai";
import { validateEvaluation, type ValidatedEvaluation } from "./validate";
import { buildSystemInstruction, buildUserText, buildResponseSchema } from "./prompt";
import { runWithBudget, type AttemptOutcome } from "./budget";
import type { Evaluator, EvaluateArgs, EvaluationResult } from "./evaluator";
import { maybeWriteDebugPayload } from "./debug";

/** One bounded teach call: 20 s wall clock, at most 2 attempts (§4, §7). */
const TOTAL_MS = 20_000;
const MAX_ATTEMPTS = 2;

export interface GeminiEvaluatorOptions {
  apiKey?: string;
  model?: string;
  /** Allows live runners to enforce a remaining provider-call budget. */
  maxAttempts?: number;
}

export class GeminiEvaluator implements Evaluator {
  private readonly ai: GoogleGenAI;
  private readonly model: string;
  private readonly maxAttempts: number;

  constructor(opts: GeminiEvaluatorOptions = {}) {
    this.maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS;
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1 || this.maxAttempts > MAX_ATTEMPTS) {
      throw new Error("maxAttempts must be 1 or 2");
    }
    const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    this.model = opts.model ?? process.env.GEMINI_MODEL ?? "";
    if (!this.model) throw new Error("GEMINI_MODEL is not set");
    // Disable the SDK's own retries; runWithBudget is the only retry layer.
    this.ai = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
  }

  async evaluate({ sessionId, turns, topic, signal }: EvaluateArgs): Promise<EvaluationResult> {
    if (!topic) throw new Error("Missing topic in evaluate args");
    const systemInstruction = buildSystemInstruction(topic);
    const RESPONSE_SCHEMA = buildResponseSchema(topic);
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
            responseSchema: RESPONSE_SCHEMA as any,
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
        return { ok: true, value: validateEvaluation(parsed, { sessionId, turns, topic }) };
      } catch {
        return { ok: false, reason: "invalid_output" };
      }
    };

    const result = await runWithBudget<ValidatedEvaluation>(callOnce, {
      totalMs: TOTAL_MS,
      maxAttempts: this.maxAttempts,
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
