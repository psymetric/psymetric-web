import { z } from "zod";

/**
 * POST /api/seo/keyword-targets — Create KeywordTarget
 * Per SIL-1-INGEST-DISCIPLINE.md §8.1
 */
export const CreateKeywordTargetSchema = z
  .object({
    query: z.string().min(1, "query is required"),
    locale: z.string().min(1, "locale is required"),
    device: z.enum(["desktop", "mobile"]),
    isPrimary: z.boolean().optional(),
    intent: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();
