import { z } from "zod";

export const CreateEntitySchema = z.object({
  entityType: z.enum(["guide", "concept", "project", "news"]),
  title: z.string().min(1),
  summary: z.string().optional(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  slug: z.string().optional(),
  repoUrl: z.string().url().optional(),
  conceptKind: z.enum(["standard", "model", "comparison"]).optional(),
  llmAssisted: z.boolean().optional(),
});
