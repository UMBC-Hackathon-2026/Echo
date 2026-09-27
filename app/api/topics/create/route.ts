import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { topics } from "@/lib/db/schema";
import { createTopic } from "@/lib/topics/create";
import { extractRubric } from "@/lib/topics/extract";
import { admitUpload } from "@/lib/topics/upload-limit";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  return createTopic(request, {
    admit: admitUpload,
    async create(name) {
      const [topic] = await getDb().insert(topics).values({ name, status: "pending" }).returning({ id: topics.id });
      return topic.id;
    },
    async processing(id) {
      await getDb().update(topics).set({ status: "processing", updatedAt: new Date() }).where(eq(topics.id, id));
    },
    async ready(id, rubricData) {
      await getDb().update(topics).set({ status: "ready", rubricData, updatedAt: new Date() }).where(eq(topics.id, id));
    },
    async failed(id) {
      await getDb().update(topics).set({ status: "failed", rubricData: null, updatedAt: new Date() }).where(eq(topics.id, id));
    },
    extract: extractRubric,
  });
}
