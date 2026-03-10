import { z } from "zod";

// Content Graph Phase 1 Schemas
// Per docs/specs/CONTENT-GRAPH-DATA-MODEL.md, docs/specs/CONTENT-GRAPH-PHASES.md

export const CG_SURFACE_TYPES = ["website", "wiki", "blog", "x", "youtube"] as const;
export const CG_PUBLISHING_STATES = ["draft", "published", "archived"] as const;
export const CG_PAGE_ROLES = ["primary", "supporting", "reviewed", "compared", "navigation"] as const;
export const CG_LINK_ROLES = ["hub", "support", "navigation"] as const;

export const CreateCgSurfaceSchema = z
  .object({
    type: z.enum(CG_SURFACE_TYPES),
    key: z.string().min(1).max(100),
    label: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export const CreateCgSiteSchema = z
  .object({
    surfaceId: z.string().uuid(),
    domain: z.string().min(1).max(255),
    framework: z.string().min(1).optional(),
    isCanonical: z.boolean().optional(),
    notes: z.string().optional(),
  })
  .strict();

export const CreateCgPageSchema = z
  .object({
    siteId: z.string().uuid(),
    contentArchetypeId: z.string().uuid().optional(),
    url: z.string().min(1).max(2048),
    title: z.string().min(1),
    canonicalUrl: z.string().optional(),
    publishingState: z.enum(CG_PUBLISHING_STATES).optional(),
    isIndexable: z.boolean().optional(),
  })
  .strict();

export const CreateCgContentArchetypeSchema = z
  .object({
    key: z.string().min(1).max(100),
    label: z.string().min(1),
  })
  .strict();

export const CreateCgTopicSchema = z
  .object({
    key: z.string().min(1).max(100),
    label: z.string().min(1),
  })
  .strict();

export const CreateCgEntitySchema = z
  .object({
    key: z.string().min(1).max(100),
    label: z.string().min(1),
    entityType: z.string().min(1).max(100),
  })
  .strict();

export const CreateCgPageTopicSchema = z
  .object({
    pageId: z.string().uuid(),
    topicId: z.string().uuid(),
    role: z.enum(CG_PAGE_ROLES).optional(),
  })
  .strict();

export const CreateCgPageEntitySchema = z
  .object({
    pageId: z.string().uuid(),
    entityId: z.string().uuid(),
    role: z.enum(CG_PAGE_ROLES).optional(),
  })
  .strict();

export const CreateCgInternalLinkSchema = z
  .object({
    sourcePageId: z.string().uuid(),
    targetPageId: z.string().uuid(),
    anchorText: z.string().optional(),
    linkRole: z.enum(CG_LINK_ROLES).optional(),
  })
  .strict();

export const CreateCgSchemaUsageSchema = z
  .object({
    pageId: z.string().uuid(),
    schemaType: z.string().min(1).max(100),
    isPrimary: z.boolean().optional(),
  })
  .strict();

export type CreateCgSurfaceInput = z.infer<typeof CreateCgSurfaceSchema>;
export type CreateCgSiteInput = z.infer<typeof CreateCgSiteSchema>;
export type CreateCgPageInput = z.infer<typeof CreateCgPageSchema>;
export type CreateCgContentArchetypeInput = z.infer<typeof CreateCgContentArchetypeSchema>;
export type CreateCgTopicInput = z.infer<typeof CreateCgTopicSchema>;
export type CreateCgEntityInput = z.infer<typeof CreateCgEntitySchema>;
export type CreateCgPageTopicInput = z.infer<typeof CreateCgPageTopicSchema>;
export type CreateCgPageEntityInput = z.infer<typeof CreateCgPageEntitySchema>;
export type CreateCgInternalLinkInput = z.infer<typeof CreateCgInternalLinkSchema>;
export type CreateCgSchemaUsageInput = z.infer<typeof CreateCgSchemaUsageSchema>;
