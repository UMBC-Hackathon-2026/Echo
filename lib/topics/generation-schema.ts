import { z } from "zod";
import { DynamicRubricShape } from "@/lib/contracts/dynamic-rubric";
import { geminiCompatibleJsonSchema } from "@/lib/gemini/json-schema";

export const ExtractionResultSchema = z.object({
  status: z.enum(["readable", "unreadable_pdf", "insufficient_material"]),
  rubric: z.unknown(),
}).strict();

// Keep the wire shape derived from the contract, but enforce lengths, patterns,
// and collection limits locally. Sending those constraints together caused
// Gemini to reject this rubric schema with HTTP 400 INVALID_ARGUMENT.
export const rubricGenerationSchema = geminiCompatibleJsonSchema(z.toJSONSchema(z.object({
  status: z.enum(["readable", "unreadable_pdf", "insufficient_material"]),
  rubric: DynamicRubricShape.nullable(),
}).strict()));
