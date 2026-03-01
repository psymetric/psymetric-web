import { z } from "zod";
import { DraftArtifactKind } from "@prisma/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ISO_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

const S0ScoresSchema = z
  .object({
    citability: z.number().int().min(0).max(100),
    extractability: z.number().int().min(0).max(100),
    factualDensity: z.number().int().min(0).max(100),
  })
  .strict();

const S0ContentSchema = z
  .object({
    schemaVersion: z.literal("byda.s0.v1"),
    entityId: z.string().regex(UUID_RE, "content.entityId must be a valid UUID"),
    scores: S0ScoresSchema,
    notes: z.string().optional(),
    createdAt: z.string().regex(
      ISO_TIMESTAMP_RE,
      "content.createdAt must be a valid ISO 8601 timestamp (YYYY-MM-DDTHH:mm:ssZ)"
    ),
  })
  .strict();

export const CreateDraftArtifactSchema = z
  .object({
    kind: z.literal(DraftArtifactKind.byda_s_audit),
    entityId: z.string().regex(UUID_RE, "entityId must be a valid UUID"),
    content: S0ContentSchema,
  })
  .strict();
