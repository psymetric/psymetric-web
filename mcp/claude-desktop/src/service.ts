import { PrismaClient, ContentEntityType, RelationType, EntityType } from '@prisma/client';
import { 
  SearchEntitiesInput, 
  GetEntityInput, 
  GetEntityGraphInput 
} from './schemas.js';
import { 
  createProjectNotFoundError, 
  createEntityNotFoundError, 
  createInternalError 
} from './errors.js';
import { logger } from './logger.js';

export class PsyMetricService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async initialize(): Promise<void> {
    try {
      await this.prisma.$connect();
      logger.info('prisma_connected');
    } catch (error) {
      logger.error('prisma_connection_failed', error as Error);
      throw createInternalError('Failed to connect to database');
    }
  }

  async shutdown(): Promise<void> {
    await this.prisma.$disconnect();
    logger.info('prisma_disconnected');
  }

  async listProjects() {
    const startTime = Date.now();
    try {
      const projects = await this.prisma.project.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: {
          name: 'asc'
        },
        take: 100
      });

      const duration = Date.now() - startTime;
      logger.logToolCall('list_projects', undefined, undefined, duration, { 
        count: projects.length 
      });

      return { projects };
    } catch (error) {
      logger.error('list_projects_failed', error as Error);
      throw createInternalError('Failed to retrieve projects');
    }
  }

  async searchEntities(input: SearchEntitiesInput) {
    const startTime = Date.now();
    const { projectId, query, entityTypes, limit } = input;

    try {
      // Verify project exists
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true }
      });

      if (!project) {
        throw createProjectNotFoundError(projectId);
      }

      // Build search conditions
      const where: any = {
        projectId,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { summary: { contains: query, mode: 'insensitive' } }
        ]
      };

      if (entityTypes && entityTypes.length > 0) {
        where.entityType = { in: entityTypes as ContentEntityType[] };
      }

      // Get total count
      const totalCount = await this.prisma.entity.count({ where });

      // Get entities with deterministic ordering
      const entities = await this.prisma.entity.findMany({
        where,
        select: {
          id: true,
          entityType: true,
          title: true,
          slug: true,
          summary: true,
          status: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: [
          { updatedAt: 'desc' },
          { id: 'asc' }
        ],
        take: limit
      });

      const duration = Date.now() - startTime;
      logger.logToolCall('search_entities', projectId, undefined, duration, { 
        query, 
        totalCount, 
        returned: entities.length 
      });

      return { entities, totalCount };
    } catch (error) {
      if (error instanceof Error && error.name === 'MCPServerError') {
        throw error;
      }
      logger.error('search_entities_failed', error as Error, { projectId, query });
      throw createInternalError('Failed to search entities');
    }
  }

  async getEntity(input: GetEntityInput) {
    const startTime = Date.now();
    const { projectId, entityId } = input;

    try {
      // Verify project exists
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true }
      });

      if (!project) {
        throw createProjectNotFoundError(projectId);
      }

      // Get entity with composite key check
      const entity = await this.prisma.entity.findUnique({
        where: {
          id: entityId
        },
        select: {
          id: true,
          entityType: true,
          title: true,
          slug: true,
          summary: true,
          difficulty: true,
          conceptKind: true,
          comparisonTargets: true,
          repoUrl: true,
          repoDefaultBranch: true,
          license: true,
          status: true,
          canonicalUrl: true,
          contentRef: true,
          publishedAt: true,
          archivedAt: true,
          createdAt: true,
          updatedAt: true,
          projectId: true
        }
      });

      if (!entity || entity.projectId !== projectId) {
        throw createEntityNotFoundError(entityId);
      }

      // Map entity type to enum for relationship queries
      const entityTypeForRelations = entity.entityType as unknown as EntityType;

      // Calculate relationship counts
      const [outgoingCount, incomingCount] = await Promise.all([
        this.prisma.entityRelation.count({
          where: {
            projectId,
            fromEntityId: entityId,
            fromEntityType: entityTypeForRelations
          }
        }),
        this.prisma.entityRelation.count({
          where: {
            projectId,
            toEntityId: entityId,
            toEntityType: entityTypeForRelations
          }
        })
      ]);

      const { projectId: _, ...entityWithoutProjectId } = entity;
      const entityWithCounts = {
        ...entityWithoutProjectId,
        relationshipCounts: {
          outgoing: outgoingCount,
          incoming: incomingCount
        }
      };

      const duration = Date.now() - startTime;
      logger.logToolCall('get_entity', projectId, entityId, duration);

      return { entity: entityWithCounts };
    } catch (error) {
      if (error instanceof Error && error.name === 'MCPServerError') {
        throw error;
      }
      logger.error('get_entity_failed', error as Error, { projectId, entityId });
      throw createInternalError('Failed to retrieve entity');
    }
  }

  async getEntityGraph(input: GetEntityGraphInput) {
    const startTime = Date.now();
    const { projectId, entityId, depth = 1, relationshipTypes } = input;

    try {
      // Verify project exists
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true }
      });

      if (!project) {
        throw createProjectNotFoundError(projectId);
      }

      // Verify root entity exists and belongs to project
      const rootEntity = await this.prisma.entity.findUnique({
        where: { id: entityId },
        select: { id: true, projectId: true }
      });

      if (!rootEntity || rootEntity.projectId !== projectId) {
        throw createEntityNotFoundError(entityId);
      }

      // Get relationships filtering by project first
      const relationWhere: any = {
        projectId,
        OR: [
          { fromEntityId: entityId },
          { toEntityId: entityId }
        ]
      };

      if (relationshipTypes && relationshipTypes.length > 0) {
        relationWhere.relationType = { in: relationshipTypes as RelationType[] };
      }

      const relations = await this.prisma.entityRelation.findMany({
        where: relationWhere,
        select: {
          fromEntityId: true,
          toEntityId: true,
          relationType: true,
          notes: true,
          fromEntityType: true,
          toEntityType: true
        },
        take: 200 // Hard limit
      });

      // Collect entity IDs (Entity-only traversal)
      const entityIds = new Set<string>([entityId]);
      const edges: any[] = [];

      for (const relation of relations) {
        // Only include if both endpoints are Content Entity types
        const isFromContentEntity = ['guide', 'concept', 'project', 'news'].includes(relation.fromEntityType);
        const isToContentEntity = ['guide', 'concept', 'project', 'news'].includes(relation.toEntityType);
        
        if (isFromContentEntity && isToContentEntity) {
          entityIds.add(relation.fromEntityId);
          entityIds.add(relation.toEntityId);
          edges.push({
            fromEntityId: relation.fromEntityId,
            toEntityId: relation.toEntityId,
            relationType: relation.relationType,
            notes: relation.notes
          });
        }
      }

      // If depth > 1, get second-level relationships (simplified for Phase 1)
      if (depth > 1) {
        const secondLevelIds = Array.from(entityIds).filter(id => id !== entityId);
        if (secondLevelIds.length > 0) {
          const secondLevelRelations = await this.prisma.entityRelation.findMany({
            where: {
              projectId,
              OR: [
                { fromEntityId: { in: secondLevelIds } },
                { toEntityId: { in: secondLevelIds } }
              ]
            },
            select: {
              fromEntityId: true,
              toEntityId: true,
              relationType: true,
              notes: true,
              fromEntityType: true,
              toEntityType: true
            },
            take: 200
          });

          for (const relation of secondLevelRelations) {
            if (entityIds.size >= 100) break; // Node limit

            // Entity-only check
            const isFromContentEntity = ['guide', 'concept', 'project', 'news'].includes(relation.fromEntityType);
            const isToContentEntity = ['guide', 'concept', 'project', 'news'].includes(relation.toEntityType);
            
            if (isFromContentEntity && isToContentEntity) {
              entityIds.add(relation.fromEntityId);
              entityIds.add(relation.toEntityId);
              edges.push({
                fromEntityId: relation.fromEntityId,
                toEntityId: relation.toEntityId,
                relationType: relation.relationType,
                notes: relation.notes
              });
            }
          }
        }
      }

      // Get entity details
      const entities = await this.prisma.entity.findMany({
        where: {
          id: { in: Array.from(entityIds) },
          projectId // Additional safety check
        },
        select: {
          id: true,
          entityType: true,
          title: true,
          slug: true,
          summary: true,
          status: true
        },
        take: 100 // Hard limit
      });

      // Build nodes with depth calculation
      const nodes = entities.map((entity: any) => ({
        ...entity,
        depth: entity.id === entityId ? 0 : 1 // Simplified depth for Phase 1
      }));

      // Sort deterministically
      nodes.sort((a: any, b: any) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      });

      edges.sort((a: any, b: any) => {
        if (a.fromEntityId !== b.fromEntityId) {
          return a.fromEntityId.localeCompare(b.fromEntityId);
        }
        return a.toEntityId.localeCompare(b.toEntityId);
      });

      const duration = Date.now() - startTime;
      logger.logToolCall('get_entity_graph', projectId, entityId, duration, { 
        depth, 
        nodeCount: nodes.length, 
        edgeCount: edges.length 
      });

      return { nodes, edges };
    } catch (error) {
      if (error instanceof Error && error.name === 'MCPServerError') {
        throw error;
      }
      logger.error('get_entity_graph_failed', error as Error, { projectId, entityId, depth });
      throw createInternalError('Failed to retrieve entity graph');
    }
  }
}
