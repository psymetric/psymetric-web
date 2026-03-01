import { z } from "zod";

/**
 * POST /api/entities/[id]/verify-freshness
 *
 * Operator action: mark an entity as content-verified at a given timestamp.
 * Updates Entity.lastVerifiedAt (nullable DateTime in production schema).
 *
 * Body is optional: if verifiedAt is omitted, the server uses now().
 * No other fields are accepted (.strict()).
 */

const ISO_8601_DATETIME_TZ =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export const VerifyFreshnessSchema = z
  .object({
    verifiedAt: z
      .string()
      .regex(
        ISO_8601_DATETIME_TZ,
        "verifiedAt must be a valid ISO 8601 datetime with timezone (e.g. 2025-01-01T00:00:00Z)"
      )
      .refine(
        (val) => !isNaN(new Date(val).getTime()),
        "verifiedAt must be a valid ISO 8601 datetime with timezone"
      )
      .optional(),
  })
  .strict();

export type VerifyFreshnessInput = z.infer<typeof VerifyFreshnessSchema>;
