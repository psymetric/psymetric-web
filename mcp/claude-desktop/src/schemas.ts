import { z } from 'zod';

// Input validation schemas
export const projectIdSchema = z.string().uuid();
export const entityIdSchema = z.string().uuid();

export const searchEntitiesSchema = z.object({
  projectId: projectIdSchema,
  query: z.string().min(1).max(256),
  entityTypes: z.array(z.enum(['guide', 'concept', 'project', 'news'])).optional(),
  limit: z.number().int().min(1).max(50).default(20)
});

export const getEntitySchema = z.object({
  projectId: projectIdSchema,
  entityId: entityIdSchema
});

export const getEntityGraphSchema = z.object({
  projectId: projectIdSchema,
  entityId: entityIdSchema,
  depth: z.number().int().min(1).max(2).default(1),
  relationshipTypes: z.array(z.enum([
    'GUIDE_USES_CONCEPT',
    'GUIDE_EXPLAINS_CONCEPT', 
    'GUIDE_REFERENCES_SOURCE',
    'CONCEPT_RELATES_TO_CONCEPT',
    'CONCEPT_REFERENCES_SOURCE',
    'NEWS_DERIVED_FROM_SOURCE',
    'NEWS_REFERENCES_SOURCE',
    'NEWS_REFERENCES_CONCEPT',
    'PROJECT_IMPLEMENTS_CONCEPT',
    'PROJECT_REFERENCES_SOURCE',
    'PROJECT_HAS_GUIDE',
    'DISTRIBUTION_PROMOTES_GUIDE',
    'DISTRIBUTION_PROMOTES_CONCEPT',
    'DISTRIBUTION_PROMOTES_PROJECT',
    'DISTRIBUTION_PROMOTES_NEWS',
    'VIDEO_EXPLAINS_GUIDE',
    'VIDEO_EXPLAINS_CONCEPT',
    'VIDEO_EXPLAINS_PROJECT',
    'VIDEO_EXPLAINS_NEWS'
  ])).optional()
});

export type SearchEntitiesInput = z.infer<typeof searchEntitiesSchema>;
export type GetEntityInput = z.infer<typeof getEntitySchema>;
export type GetEntityGraphInput = z.infer<typeof getEntityGraphSchema>;
