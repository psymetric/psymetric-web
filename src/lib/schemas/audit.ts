import { z } from "zod";
import { UUID_RE } from "@/lib/constants";


export const RunAuditSchema = z
  .object({
    entityId: z.string().regex(UUID_RE, "entityId must be a valid UUID"),
  })
  .strict();
