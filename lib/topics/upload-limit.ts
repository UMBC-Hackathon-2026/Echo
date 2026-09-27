import "server-only";

// Single-process demo protection, not a distributed provider quota scheduler.
// The global buckets apply even if an attacker changes forwarding headers.
export function createUploadLimiter() {
  let minute = { count: 0, until: 0 };
  let day = { count: 0, until: 0 };
  const clients = new Map<string, { count: number; until: number }>();
  return (client: string, now = Date.now()): number => {
    for (const [key, bucket] of clients) if (bucket.until <= now) clients.delete(key);
    if (minute.until <= now) minute = { count: 0, until: now + 60_000 };
    if (day.until <= now) day = { count: 0, until: now + 86_400_000 };
    const bucket = clients.get(client) ?? { count: 0, until: now + 600_000 };
    const waits = [
      minute.count >= 10 ? minute.until - now : 0,
      day.count >= 50 ? day.until - now : 0,
      bucket.count >= 3 ? bucket.until - now : 0,
    ];
    const wait = Math.max(...waits);
    if (wait) return Math.ceil(wait / 1000);
    // At most 50 new keys per 24-hour window: bounded by the global budget.
    minute.count++;
    day.count++;
    bucket.count++;
    clients.set(client, bucket);
    return 0;
  };
}

export const admitUpload = createUploadLimiter();
