/**
 * Project validation schemas
 *
 * Per PROJECT-BLUEPRINT-SPEC.md and VEDA-CREATE-PROJECT-WORKFLOW.md
 * All write schemas use .strict() per invariant rules.
 */
import { z } from "zod";

// ── Slug generation helper ──────────────────────────────────────────────────

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

/**
 * Derive a URL-safe slug from a project name.
 * Rules: lowercase, alphanumeric + hyphens, no leading/trailing hyphens.
 */
export function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Create Project ──────────────────────────────────────────────────────────

export const CreateProjectSchema = z
  .object({
    name: z.string().min(1).max(200),
    slug: z
      .string()
      .min(2)
      .max(100)
      .regex(SLUG_RE, "Slug must be lowercase alphanumeric with hyphens, no leading/trailing hyphens")
      .optional(),
    description: z.string().max(2000).optional(),
  })
  .strict();

// ── Blueprint content ───────────────────────────────────────────────────────

export const BlueprintContentSchema = z
  .object({
    schemaVersion: z.literal("blueprint.v1"),

    brandIdentity: z
      .object({
        projectName: z.string().min(1).max(200),
        strategicNiche: z.string().min(1).max(500),
        audience: z.string().max(500).optional(),
        authorityPosture: z.string().max(500).optional(),
      })
      .strict(),

    surfaceRegistry: z
      .array(
        z
          .object({
            type: z.enum(["website", "wiki", "blog", "x", "youtube"]),
            key: z.string().min(1).max(50),
            label: z.string().max(100).optional(),
          })
          .strict()
      )
      .min(1)
      .max(20),

    websiteArchitecture: z
      .object({
        domain: z.string().max(200).optional(),
        framework: z.string().max(50).optional(),
        notes: z.string().max(2000).optional(),
      })
      .strict()
      .optional(),

    contentArchetypes: z
      .array(
        z
          .object({
            key: z.string().min(1).max(50),
            label: z.string().min(1).max(100),
          })
          .strict()
      )
      .max(50)
      .optional(),

    entityClusters: z
      .array(
        z
          .object({
            key: z.string().min(1).max(100),
            label: z.string().min(1).max(200),
            entityType: z.string().max(50).optional(),
          })
          .strict()
      )
      .max(200)
      .optional(),

    keywordTerritory: z
      .object({
        seedKeywords: z.array(z.string().max(200)).max(100).optional(),
        competitorDomains: z.array(z.string().max(200)).max(50).optional(),
        notes: z.string().max(2000).optional(),
      })
      .strict()
      .optional(),

    authorityModel: z
      .object({
        approach: z.string().max(500).optional(),
        notes: z.string().max(2000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type BlueprintContent = z.infer<typeof BlueprintContentSchema>;

export const ProposeBlueprintSchema = z
  .object({
    content: BlueprintContentSchema,
    llmModel: z.string().max(100).optional(),
  })
  .strict();
