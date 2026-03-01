import { z } from "zod";
import { ClaimType } from "@prisma/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ISO_DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

const isoDateString = z.string().refine(
  (val) => {
    if (!ISO_DATE_ONLY_RE.test(val) && !ISO_TIMESTAMP_RE.test(val))
      return false;
    const parsed = new Date(val);
    if (isNaN(parsed.getTime())) return false;
    if (ISO_DATE_ONLY_RE.test(val)) {
      return parsed.toISOString().slice(0, 10) === val;
    }
    return true;
  },
  "Must be a valid ISO date string"
);

export const CreateQuotableBlockSchema = z.object({
  entityId: z.string().regex(UUID_RE, "entityId must be a valid UUID"),
  text: z.string().min(1),
  claimType: z.nativeEnum(ClaimType),
  sourceCitation: z.string().optional(),
  topicTag: z.string().optional(),
  verifiedUntil: isoDateString.optional(),
});
