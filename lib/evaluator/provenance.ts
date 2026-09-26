import "server-only";
import type { EvidenceRef, Span } from "@/lib/contracts";

/** Only original student turns from one session may enter the validator. */
export interface StudentTurn {
  session_id: string;
  turn_id: string;
  role: "student";
  text: string;
}

export function turnNumber(id: string): number {
  if (!/^t\d+$/.test(id) || !Number.isSafeInteger(Number(id.slice(1)))) {
    throw new Error("Invalid student turn id");
  }
  return Number(id.slice(1));
}

export function indexStudentTurns(sessionId: string, turns: readonly StudentTurn[]) {
  const index = new Map<string, StudentTurn>();
  const numbers = new Set<number>();
  for (const turn of turns) {
    const number = turnNumber(turn.turn_id);
    if (turn.session_id !== sessionId || turn.role !== "student" || numbers.has(number)) {
      throw new Error("Student turns must be unique and belong to this session");
    }
    numbers.add(number);
    index.set(turn.turn_id, turn);
  }
  return index;
}

/** Map each normalized UTF-16 code unit back to its original grapheme span. */
function normalizedWithOffsets(text: string) {
  let normalized = "";
  const starts: number[] = [];
  const ends: number[] = [];
  const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  for (const { segment, index } of segmenter.segment(text)) {
    const value = segment.normalize("NFC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
    for (const character of value) {
      if (/\s/u.test(character)) {
        if (normalized.endsWith(" ")) {
          ends[ends.length - 1] = index + segment.length;
          continue;
        }
        normalized += " ";
        starts.push(index);
        ends.push(index + segment.length);
      } else {
        normalized += character;
        for (let i = 0; i < character.length; i++) {
          starts.push(index);
          ends.push(index + segment.length);
        }
      }
    }
  }
  return { normalized, starts, ends };
}

export function normalizeEvidence(text: string): string {
  return text.normalize("NFC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/gu, " ");
}

/** Exact cited turn only. No case folding, punctuation removal, or operator changes. */
export function resolveEvidence(ref: EvidenceRef, turns: ReadonlyMap<string, StudentTurn>): Span | null {
  const turn = turns.get(ref.turn_id);
  const needle = normalizeEvidence(ref.quote);
  if (!turn || !needle.trim()) return null;
  const { normalized, starts, ends } = normalizedWithOffsets(turn.text);
  let match = normalized.indexOf(needle);
  while (match !== -1) {
    const start = starts[match];
    const end = ends[match + needle.length - 1];
    const quote = turn.text.slice(start, end);
    // Do not accept a partial grapheme whose original slice normalizes differently.
    if (normalizeEvidence(quote) === needle) return { turn_id: ref.turn_id, start, end, quote };
    match = normalized.indexOf(needle, match + 1);
  }
  return null;
}

export function resolveEvidenceList(refs: readonly EvidenceRef[], turns: ReadonlyMap<string, StudentTurn>): Span[] {
  const unique = new Map<string, Span>();
  for (const ref of refs) {
    const span = resolveEvidence(ref, turns);
    if (span) unique.set(`${span.turn_id}:${span.start}:${span.end}`, span);
  }
  return [...unique.values()];
}
