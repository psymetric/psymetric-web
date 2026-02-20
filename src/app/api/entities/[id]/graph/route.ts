/**
 * GET /api/entities/[id]/graph — Retrieve entity with relationship graph
 *
 * Phase 1 read-only endpoint for MCP `get_entity_graph` tool.
 * - Depth-limited traversal (depth=1 or depth=2)
 * - Project-scoped with cross-project isolation
 * - Deterministic BFS expansion with explicit ordering
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  successResponse,
  badRequest,
  notFound,
  serverError,
} from "@/lib/api-response";
import { resolveProjectId } from "@/lib/project";
import { RelationType } from "@prisma/client";
import type { Prisma } from "@prisma/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_RELATION_TYPES = Object.values(RelationType);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) return badRequest(error);

    const { id } = await context.params;

    if (!id || !UUID_RE.test(id)) {
      return badRequest("id must be a valid UUID");
    }

    // Parse depth parameter
    const searchParams = request.nextUrl.searchParams;
    const depthParam = searchParams.get("depth");
    let depth = 1;

    if (depthParam) {
      const parsed = parseInt(depthParam, 10);
      if (isNaN(parsed) || (parsed !== 1 && parsed !== 2)) {
        return badRequest("depth must be 1 or 2");
      }
      depth = parsed;
    }

    // Parse relationshipTypes filter (optional)
    const relationshipTypesParam = searchParams.get("relationshipTypes");
    let relationshipTypeFilter: RelationType[] | null = null;

    if (relationshipTypesParam) {
      const types = relationshipTypesParam.split(",");
      for (const type of types) {
        if (!VALID_RELATION_TYPES.includes(type as RelationType)) {
          return badRequest(
            `Invalid relationship type: ${type}. Must be one of: ${VALID_RELATION_TYPES.join(", ")}`
          );
        }
      }
      relationshipTypeFilter = types as RelationType[];
    }

    // Verify root entity exists in project
    const rootEntity = await prisma.entity.findUnique({
      where: { id },
    });

    if (!rootEntity || rootEntity.projectId !== projectId) {
      return notFound("Entity not found");
    }

    // Build relationship filter
    const relationWhere: Prisma.EntityRelationWhereInput = {
      projectId,
      OR: [{ fromEntityId: id }, { toEntityId: id }],
    };

    if (relationshipTypeFilter) {
      relationWhere.relationType = { in: relationshipTypeFilter };
    }

    // Fetch depth=1 relationships
    const depth1Relations = await prisma.entityRelation.findMany({
      where: relationWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    // Collect related entity IDs
    const depth1EntityIds = new Set<string>();
    for (const rel of depth1Relations) {
      if (rel.fromEntityId !== id) depth1EntityIds.add(rel.fromEntityId);
      if (rel.toEntityId !== id) depth1EntityIds.add(rel.toEntityId);
    }

    // Fetch depth=1 entities (sorted deterministically)
    const depth1EntityIdArray = Array.from(depth1EntityIds).sort();
    const depth1Entities = await prisma.entity.findMany({
      where: {
        id: { in: depth1EntityIdArray },
        projectId, // Enforce project scope
      },
      select: {
        id: true,
        entityType: true,
        title: true,
        slug: true,
        status: true,
      },
      orderBy: [{ id: "asc" }],
    });

    // If depth=2, expand one hop further
    let depth2Relations: typeof depth1Relations = [];
    let depth2Entities: typeof depth1Entities = [];

    if (depth === 2 && depth1EntityIds.size > 0) {
      const depth2RelationWhere: Prisma.EntityRelationWhereInput = {
        projectId,
        OR: [
          { fromEntityId: { in: depth1EntityIdArray } },
          { toEntityId: { in: depth1EntityIdArray } },
        ],
      };

      if (relationshipTypeFilter) {
        depth2RelationWhere.relationType = { in: relationshipTypeFilter };
      }

      depth2Relations = await prisma.entityRelation.findMany({
        where: depth2RelationWhere,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });

      // Collect depth=2 entity IDs (excluding already fetched)
      const depth2EntityIds = new Set<string>();
      for (const rel of depth2Relations) {
        if (
          rel.fromEntityId !== id &&
          !depth1EntityIds.has(rel.fromEntityId)
        ) {
          depth2EntityIds.add(rel.fromEntityId);
        }
        if (rel.toEntityId !== id && !depth1EntityIds.has(rel.toEntityId)) {
          depth2EntityIds.add(rel.toEntityId);
        }
      }

      if (depth2EntityIds.size > 0) {
        const depth2EntityIdArray = Array.from(depth2EntityIds).sort();
        depth2Entities = await prisma.entity.findMany({
          where: {
            id: { in: depth2EntityIdArray },
            projectId,
          },
          select: {
            id: true,
            entityType: true,
            title: true,
            slug: true,
            status: true,
          },
          orderBy: [{ id: "asc" }],
        });
      }
    }

    // Deduplicate relationships by id (keep first occurrence)
    const seenRelationIds = new Set<string>();
    const allRelations = [...depth1Relations, ...depth2Relations].filter(
      (rel) => {
        if (seenRelationIds.has(rel.id)) {
          return false;
        }
        seenRelationIds.add(rel.id);
        return true;
      }
    );

    // Deduplicate entities by id (keep first occurrence)
    const seenEntityIds = new Set<string>();
    const allEntities = [...depth1Entities, ...depth2Entities].filter((e) => {
      if (seenEntityIds.has(e.id)) {
        return false;
      }
      seenEntityIds.add(e.id);
      return true;
    });

    // Build entity lookup map
    const entityMap = new Map(allEntities.map((e) => [e.id, e]));

    // Build response relationships with embedded related entity details
    const relationships = allRelations.map((rel) => ({
      id: rel.id,
      relationType: rel.relationType,
      fromEntityId: rel.fromEntityId,
      toEntityId: rel.toEntityId,
      notes: rel.notes,
      createdAt: rel.createdAt.toISOString(),
      relatedEntity:
        rel.fromEntityId === id
          ? entityMap.get(rel.toEntityId) || null
          : entityMap.get(rel.fromEntityId) || null,
    }));

    return successResponse({
      rootEntity: {
        id: rootEntity.id,
        projectId: rootEntity.projectId,
        entityType: rootEntity.entityType,
        title: rootEntity.title,
        slug: rootEntity.slug,
        summary: rootEntity.summary,
        difficulty: rootEntity.difficulty,
        conceptKind: rootEntity.conceptKind,
        repoUrl: rootEntity.repoUrl,
        status: rootEntity.status,
        canonicalUrl: rootEntity.canonicalUrl,
        lastVerifiedAt: rootEntity.lastVerifiedAt?.toISOString() || null,
        createdAt: rootEntity.createdAt.toISOString(),
        updatedAt: rootEntity.updatedAt.toISOString(),
      },
      relationships,
      depth,
    });
  } catch (error) {
    console.error("GET /api/entities/[id]/graph error:", error);
    return serverError();
  }
}
