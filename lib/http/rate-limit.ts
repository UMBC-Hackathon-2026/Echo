import "server-only";

/**
 * In-memory token-bucket rate limiter (ARCHITECTURE_REVISED §4). Applied per IP
 * and per session on /messages and /retry. NOTE: process-local — it does NOT
 * survive multiple instances; adequate for a single demo instance only.
 */
interface Bucket {
  tokens: number;
  updated: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimit {
  capacity: number;
  refillPerSec: number;
}

const DEFAULT: RateLimit = { capacity: 10, refillPerSec: 10 / 60 }; // ~10/min

/** Returns { ok: true } or { ok: false, retryAfterSec }. */
export function takeToken(key: string, limit: RateLimit = DEFAULT, now = Date.now()): { ok: true } | { ok: false; retryAfterSec: number } {
  const b = buckets.get(key) ?? { tokens: limit.capacity, updated: now };
  const elapsedSec = Math.max(0, (now - b.updated) / 1000);
  b.tokens = Math.min(limit.capacity, b.tokens + elapsedSec * limit.refillPerSec);
  b.updated = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return { ok: false, retryAfterSec: Math.ceil((1 - b.tokens) / limit.refillPerSec) };
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return { ok: true };
}

/** Test/util: clear all buckets. */
export function resetRateLimits(): void {
  buckets.clear();
}
