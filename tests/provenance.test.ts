import { describe, expect, it } from "vitest";
import { indexStudentTurns, normalizeEvidence, resolveEvidence } from "@/lib/evaluator/provenance";
import { turn } from "./helpers/phase2";

function resolve(text: string, quote: string) {
  return resolveEvidence({ turn_id: "t1", quote }, indexStudentTurns("session", [turn("t1", text)]));
}

describe("exact original-text provenance", () => {
  it.each([
    ["prefix n - 1 suffix", "n - 1", 7, 12],
    ["😀 cafe\u0301 ends", "café", 3, 8],
    ["He said “stop”.", '"stop"', 8, 14],
    ["don’t recurse", "don't", 0, 5],
    ["a\r\n \t b", "a b", 0, 7],
    ["👩‍💻 stop", "stop", 6, 10],
    ["n - 1 then n - 1", "n - 1", 0, 5],
  ])("maps %j / %j to original UTF-16 offsets", (text, quote, start, end) => {
    const span = resolve(text, quote);
    expect(span).toEqual({ turn_id: "t1", start, end, quote: text.slice(start, end) });
    expect(normalizeEvidence(span!.quote)).toBe(normalizeEvidence(quote));
  });

  it.each([
    ["n + 1", "n - 1"], ["n-1", "n - 1"], ["STOP", "stop"],
    ["n >= 0", "n > 0"], ["return(0)", "return0"], ["café", "cafe"],
    ["café", "e"], ["abc", ""], [" \n ", " "], ["a b", "a\u200bb"],
  ])("does not broaden matching: %j / %j", (text, quote) => {
    expect(resolve(text, quote)).toBeNull();
  });

  it("never searches another turn for a wrong or missing turn ID", () => {
    const turns = indexStudentTurns("session", [turn("t1", "stops"), turn("t2", "continues")]);
    expect(resolveEvidence({ turn_id: "t2", quote: "stops" }, turns)).toBeNull();
    expect(resolveEvidence({ turn_id: "t9", quote: "stops" }, turns)).toBeNull();
  });

  it("rejects other sessions, nonstudent roles, duplicate/numerically aliased IDs, and unsafe turn numbers", () => {
    expect(() => indexStudentTurns("other", [turn("t1", "hi")])).toThrow();
    expect(() => indexStudentTurns("session", [{ ...turn("t1", "hi"), role: "learner" } as never])).toThrow();
    expect(() => indexStudentTurns("session", [turn("t1", "a"), turn("t01", "b")])).toThrow();
    expect(() => indexStudentTurns("session", [turn("t9007199254740992", "hi")])).toThrow();
  });
});
