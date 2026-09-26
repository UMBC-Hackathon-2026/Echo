import "server-only";

/**
 * Owner cookies (ARCHITECTURE_REVISED §4). One httpOnly cookie PER SESSION,
 * `it_owner_<sessionId>`, holding the raw 32-byte token (the DB stores only its
 * SHA-256 hash). Read from and written to raw headers so route handlers stay
 * testable with constructed Request/Response objects. (Choice: per-session
 * cookie rather than one token-map cookie — simpler and self-scoping.)
 */
export function ownerCookieName(sessionId: string): string {
  return `it_owner_${sessionId}`;
}

export function parseCookieHeader(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function readOwnerToken(request: Request, sessionId: string): string | undefined {
  return parseCookieHeader(request.headers.get("cookie"))[ownerCookieName(sessionId)];
}

const WEEK = 60 * 60 * 24 * 7;

export function buildOwnerSetCookie(sessionId: string, token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ownerCookieName(sessionId)}=${encodeURIComponent(token)}; Path=/; Max-Age=${WEEK}; HttpOnly; SameSite=Lax${secure}`;
}
