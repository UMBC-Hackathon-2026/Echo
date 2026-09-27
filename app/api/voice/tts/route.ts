import { NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { messages, questionResults, assessmentAttempts, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { readOwnerToken } from "@/lib/http/cookies";
import { takeToken } from "@/lib/http/rate-limit";
import { ElevenLabsClient, ElevenLabsError } from "@elevenlabs/elevenlabs-js";
import { timingSafeEqual, createHash } from "node:crypto";

export const runtime = "nodejs";

const RequestBody = z.object({
  source: z.enum(["learner_message", "question_result"]),
  id: z.string().uuid()
});

// In-memory LRU cache keyed by source and id.
const cache = new Map<string, ArrayBuffer>();

function clientIp(request: Request): string {
  return (request.headers.get("x-forwarded-for")?.split(",")[0].trim()) || request.headers.get("x-real-ip") || "unknown";
}

function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

function tokenMatches(token: string, stored: Buffer): boolean {
  const h = hashToken(token);
  return h.length === stored.length && timingSafeEqual(h, stored);
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    return new Response(JSON.stringify({ error: "Voice not configured" }), { status: 503, headers: { "content-type": "application/json" } });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), { status: 400 });
  }

  const parsed = RequestBody.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "invalid_input" }), { status: 422 });
  }

  const { source, id } = parsed.data;

  // DB Fetch
  const db = getDb();
  let text = "";
  let sessionId = "";

  if (source === "learner_message") {
    const rows = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
    const msg = rows[0];
    if (!msg || msg.role !== "learner") return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    text = msg.content;
    sessionId = msg.sessionId;
  } else {
    // question_result
    const rows = await db.select({ text: questionResults.answerText, sessionId: assessmentAttempts.sessionId })
      .from(questionResults)
      .innerJoin(assessmentAttempts, eq(questionResults.attemptId, assessmentAttempts.id))
      .where(eq(questionResults.id, id)).limit(1);
    if (!rows[0]) return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    text = rows[0].text;
    sessionId = rows[0].sessionId;
  }

  // Rate limits (per session and IP)
  const ip = takeToken(`ip:${clientIp(request)}`);
  if (!ip.ok) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { "retry-after": String(ip.retryAfterSec) } });
  const sess = takeToken(`session:${sessionId}`);
  if (!sess.ok) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { "retry-after": String(sess.retryAfterSec) } });

  // Ownership verification
  const token = readOwnerToken(request, sessionId) ?? "";
  const sRows = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!sRows[0] || !tokenMatches(token, sRows[0].ownerTokenHash)) {
    return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
  }

  const cacheKey = `${source}:${id}`;
  if (cache.has(cacheKey)) {
    return new Response(cache.get(cacheKey), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=31536000",
      }
    });
  }

  if (text.length > 2000) return new Response(JSON.stringify({ error: "text too long" }), { status: 422 });

  const client = new ElevenLabsClient({ apiKey, maxRetries: 2, timeoutInSeconds: 8 });
  try {
    const stream = await client.textToSpeech.convert(voiceId, {
      outputFormat: "mp3_44100_128",
      text: text,
      modelId: "eleven_turbo_v2_5",
    });

    const response = new Response(stream as unknown as BodyInit);
    const arrayBuffer = await response.arrayBuffer();

    if (cache.size > 1000) cache.clear(); // naive LRU bound
    cache.set(cacheKey, arrayBuffer);

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=31536000",
      }
    });
  } catch (error) {
    if (error instanceof ElevenLabsError) {
       return new Response(JSON.stringify({ error: "voice_error", message: error.message }), { status: 502 });
    }
    return new Response(JSON.stringify({ error: "voice_error", message: "Timeout or unknown error" }), { status: 502 });
  }
}
