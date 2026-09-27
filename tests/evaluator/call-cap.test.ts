import { beforeEach, describe, expect, it, vi } from "vitest";
const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class { models = { generateContent }; },
}));
import { GeminiEvaluator } from "@/lib/evaluator/gemini";

beforeEach(() => generateContent.mockReset().mockResolvedValue({ text: "not JSON" }));
describe("provider-call cap", () => {
  it("uses only one provider call when one call remains, even for invalid output", async () => {
    const ev = new GeminiEvaluator({ apiKey: "fake", model: "fake", maxAttempts: 1 });
    const result = await ev.evaluate({ sessionId: "test", turns: [] });
    expect(result).toEqual({ ok: false, reason: "invalid_output", attempts: 1 });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
  it("retains the two-attempt default", async () => {
    const ev = new GeminiEvaluator({ apiKey: "fake", model: "fake" });
    const result = await ev.evaluate({ sessionId: "test", turns: [] });
    expect(result.attempts).toBe(2);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });
  it.each([0, -1, 3, 1.5, NaN])("rejects invalid attempt limit %s", (maxAttempts) => {
    expect(() => new GeminiEvaluator({ apiKey: "fake", model: "fake", maxAttempts })).toThrow();
  });
});
