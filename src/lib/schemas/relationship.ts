import { z } from "zod";
import { RelationType } from "@prisma/client";
import { UUID_RE } from "@/lib/constants";


export const CreateRelationshipSchema = z
  .object({
    fromEntityId: z.string().regex(UUID_RE, "fromEntityId must be a valid UUID"),
    toEntityId: z.string().regex(UUID_RE, "toEntityId must be a valid UUID"),
    relationType: z.nativeEnum(RelationType),
  })
  .strict();
