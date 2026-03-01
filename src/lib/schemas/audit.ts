import { z } from "zod";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const RunAuditSchema = z
  .object({
    entityId: z.string().regex(UUID_RE, "entityId must be a valid UUID"),
  })
  .strict();
