import { z } from "zod";
import { RelationType } from "@prisma/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CreateRelationshipSchema = z.object({
  fromEntityId: z.string().regex(UUID_RE, "fromEntityId must be a valid UUID"),
  toEntityId: z.string().regex(UUID_RE, "toEntityId must be a valid UUID"),
  relationType: z.nativeEnum(RelationType),
});
