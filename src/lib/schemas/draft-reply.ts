import { z } from "zod";

export const CreateDraftReplySchema = z
  .object({
    count: z.number().int().min(1).max(5).default(1),
    style: z.enum(["short", "medium", "thread"]).default("short"),
  })
  .strict();
