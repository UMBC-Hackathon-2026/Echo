import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { topics } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";
import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";

export const runtime = "nodejs";
export const maxDuration = 300;

const rubricJsonSchema = {
  type: "object",
  properties: {
    topicName: { type: "string" },
    concepts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          demonstratedWhen: { type: "string" },
          partialWhen: { type: "string" },
          probe: { type: "string" },
          examples: {
            type: "array",
            items: {
              type: "object",
              properties: {
                explanation: { type: "string" },
                expectedState: { type: "string", enum: ["not_taught", "partially_taught", "demonstrated"] },
                reason: { type: "string" }
              },
              required: ["explanation", "expectedState", "reason"]
            }
          }
        },
        required: ["id", "name", "demonstratedWhen", "partialWhen", "probe", "examples"]
      }
    },
    misconceptions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          belief: { type: "string" },
          openingLine: { type: "string" }
        },
        required: ["id", "name", "belief", "openingLine"]
      }
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          pairId: { type: "string" },
          type: { type: "string", enum: ["trace", "explain", "modify", "other"] },
          text: { type: "string" },
          answerKey: {
            type: "object",
            properties: {
              correctCriteria: { type: "array", items: { type: "string" } },
              misconceptionCriteria: { type: "array", items: { type: "string" } },
              expectedAnswer: { type: "string" }
            },
            required: ["correctCriteria", "misconceptionCriteria", "expectedAnswer"]
          }
        },
        required: ["id", "pairId", "type", "text", "answerKey"]
      }
    }
  },
  required: ["topicName", "concepts", "misconceptions", "questions"]
};

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const topicName = formData.get("topicName");
    const fileEntries = formData.getAll("files");

    if (!topicName || typeof topicName !== "string") {
      return NextResponse.json({ error: "Missing topicName" }, { status: 400 });
    }
    
    const db = getDb();

    // 1. Create a pending topic in DB
    const [topic] = await db.insert(topics).values({
      name: topicName,
      status: "pending"
    }).returning();

    // 2. Extract files
    const ai = new GoogleGenAI({});
    const uploadedFiles: any[] = [];
    const tmpDir = os.tmpdir();

    try {
      // Update status to processing
      await db.update(topics).set({ status: "processing" }).where(eq(topics.id, topic.id));

      for (const entry of fileEntries) {
        if (!(entry instanceof Blob)) continue;
        const arrayBuffer = await entry.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const tempPath = path.join(tmpDir, `${crypto.randomUUID()}.pdf`);
        await fs.writeFile(tempPath, buffer);

        const uploadedFile = await ai.files.upload({
          file: tempPath,
          config: { mimeType: "application/pdf" }
        });
        uploadedFiles.push(uploadedFile);
        await fs.unlink(tempPath).catch(() => {});
      }

      const parts: any[] = uploadedFiles.map(f => ({
        fileData: { fileUri: f.uri, mimeType: "application/pdf" }
      }));

      parts.push({
        text: `You are an expert tutor and curriculum designer. Please extract the core concepts, common student misconceptions, and a set of assessment questions for the topic: "${topicName}". 
        Make sure the assessment questions actually cover the concepts and test against the misconceptions. 
        Return the result strictly as a JSON object matching the provided schema.`
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: parts,
        config: {
          responseMimeType: "application/json",
          responseSchema: rubricJsonSchema as any
        }
      });

      if (!response.text) {
        throw new Error("No response text from Gemini");
      }

      const rubricData = JSON.parse(response.text);

      await db.update(topics).set({
        status: "ready",
        rubricData
      }).where(eq(topics.id, topic.id));

      return NextResponse.json({ topicId: topic.id });
    } catch (err) {
      await db.update(topics).set({ status: "failed" }).where(eq(topics.id, topic.id));
      throw err;
    } finally {
      // Cleanup files from Gemini
      for (const f of uploadedFiles) {
        await ai.files.delete({ name: f.name }).catch(() => {});
      }
    }
  } catch (err: any) {
    console.error("Topic creation error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
