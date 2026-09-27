import "server-only";
import { GoogleGenAI } from "@google/genai";
import { validateEvaluation, type ValidatedEvaluation } from "./validate";
import { buildSystemInstruction, buildUserText, buildResponseSchema } from "./prompt";
import { runWithBudget, type AttemptOutcome } from "./budget";
import type { EvaluationFailureDiagnostic, Evaluator, EvaluateArgs, EvaluationResult } from "./evaluator";
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
    let lastDiagnostic: EvaluationFailureDiagnostic | undefined;

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
        if (ac.signal.aborted) {
          lastDiagnostic = { stage: "timeout", code: "deadline_exceeded", message: "The evaluator request exceeded its time budget." };
          return { ok: false, reason: "timeout" };
        }
        const status = (e as { status?: number }).status;
        lastDiagnostic = providerDiagnostic(e);
        if (status === 429 || status === 503) {
          return { ok: false, reason: "rate_limited", retryAfterMs: retryAfterMsFrom(e) };
        }
        return { ok: false, reason: "provider_error" };
      } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", onAbort);
      }

      await maybeWriteDebugPayload({ sessionId, raw: text });
      if (!text) {
        lastDiagnostic = { stage: "response_parse", code: "empty_output", message: "The evaluator returned no response text." };
        return { ok: false, reason: "invalid_output" };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        lastDiagnostic = { stage: "response_parse", code: "invalid_json", message: "The evaluator returned malformed JSON." };
        return { ok: false, reason: "invalid_output" };
      }
      try {
        return { ok: true, value: validateEvaluation(parsed, { sessionId, turns, topic }) };
      } catch {
        lastDiagnostic = { stage: "response_validation", code: "contract_rejected", message: "The evaluator response failed local contract validation." };
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
    if (result.reason === "timeout" && lastDiagnostic?.stage !== "timeout") {
      lastDiagnostic = { stage: "timeout", code: "budget_exhausted", message: "The evaluator exhausted its total time budget." };
    }
    return {
      ok: false,
      reason: result.reason,
      attempts: result.attempts,
      ...(lastDiagnostic ? { diagnostic: lastDiagnostic } : {}),
    };
  }
}

function providerDiagnostic(e: unknown): EvaluationFailureDiagnostic {
  const provider = e as { status?: unknown; code?: unknown; message?: unknown };
  const providerStatus = typeof provider.status === "number" ? provider.status : undefined;
  let code = typeof provider.code === "string" || typeof provider.code === "number"
    ? String(provider.code)
    : providerStatus ? `HTTP_${providerStatus}` : "provider_error";
  let message = "The evaluator provider request failed.";

  if (typeof provider.message === "string") {
    try {
      const parsed = JSON.parse(provider.message) as { error?: { status?: unknown; message?: unknown } };
      if (typeof parsed.error?.status === "string") code = parsed.error.status;
      if (typeof parsed.error?.message === "string") message = parsed.error.message.slice(0, 300);
    } catch {
      // Do not log arbitrary provider text: it could contain request data.
    }
  }

  return {
    stage: "provider",
    code,
    message,
    ...(providerStatus ? { providerStatus } : {}),
  };
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
