/**
 * POST /api/relationships — Create a relationship
 *
 * Deterministic relationship creation with strict validation.
 * No automation, no business logic beyond validation + insert.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  successResponse,
  listResponse,
  badRequest,
  notFound,
  conflict,
  serverError,
  parsePagination,
} from "@/lib/api-response";
import { RelationType, ContentEntityType, EntityType } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { resolveProjectId, assertSameProject } from "@/lib/project";

// UUID validation regex
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Valid relation types from schema
const VALID_RELATION_TYPES = Object.values(RelationType);

function mapToEntityType(contentType: ContentEntityType): EntityType {
  // ContentEntityType is a strict subset of EntityType, but Prisma generates them as distinct enums.
  // Map explicitly to avoid unsafe casting.
  switch (contentType) {
    case "guide":
      return EntityType.guide;
    case "concept":
      return EntityType.concept;
    case "project":
      return EntityType.project;
    case "news":
      return EntityType.news;
  }
}

// =============================================================================
// GET /api/relationships
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) {
      return badRequest(error);
    }

    const searchParams = request.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(searchParams);

    // Always scope by projectId
    const where: Prisma.EntityRelationWhereInput = { projectId };

    // fromEntityId filter
    const fromEntityId = searchParams.get("fromEntityId");
    if (fromEntityId) {
      if (!UUID_RE.test(fromEntityId)) {
        return badRequest("fromEntityId must be a valid UUID");
      }
      where.fromEntityId = fromEntityId;
    }

    // toEntityId filter
    const toEntityId = searchParams.get("toEntityId");
    if (toEntityId) {
      if (!UUID_RE.test(toEntityId)) {
        return badRequest("toEntityId must be a valid UUID");
      }
      where.toEntityId = toEntityId;
    }

    // entityId filter (matches either fromEntityId or toEntityId)
    const entityId = searchParams.get("entityId");
    if (entityId) {
      if (!UUID_RE.test(entityId)) {
        return badRequest("entityId must be a valid UUID");
      }
      where.OR = [{ fromEntityId: entityId }, { toEntityId: entityId }];
    }

    // relationType filter
    const relationType = searchParams.get("relationType");
    if (relationType) {
      if (!VALID_RELATION_TYPES.includes(relationType as RelationType)) {
        return badRequest(
          `relationType must be one of: ${VALID_RELATION_TYPES.join(", ")}`
        );
      }
      where.relationType = relationType as RelationType;
    }

    const [relationships, total] = await Promise.all([
      prisma.entityRelation.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      }),
      prisma.entityRelation.count({ where }),
    ]);

    return listResponse(relationships, { page, limit, total });
  } catch (error) {
    console.error("GET /api/relationships error:", error);
    return serverError();
  }
}

// =============================================================================
// POST /api/relationships
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) {
      return badRequest(error);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    // Body must be object
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return badRequest("Request body must be an object");
    }

    const b = body as Record<string, unknown>;

    const fromEntityId = b.fromEntityId;
    const toEntityId = b.toEntityId;
    const relationTypeInput = b.relationType;

    if (typeof fromEntityId !== "string") {
      return badRequest("fromEntityId is required and must be a string");
    }

    if (typeof toEntityId !== "string") {
      return badRequest("toEntityId is required and must be a string");
    }

    if (typeof relationTypeInput !== "string") {
      return badRequest("relationType is required and must be a string");
    }

    // Validate UUID format
    if (!UUID_RE.test(fromEntityId)) {
      return badRequest("fromEntityId must be a valid UUID");
    }

    if (!UUID_RE.test(toEntityId)) {
      return badRequest("toEntityId must be a valid UUID");
    }

    // Prevent self-relationships
    if (fromEntityId === toEntityId) {
      return badRequest("Cannot create relationship from entity to itself");
    }

    // Validate relationType against schema enum
    if (!VALID_RELATION_TYPES.includes(relationTypeInput as RelationType)) {
      return badRequest(
        `relationType must be one of: ${VALID_RELATION_TYPES.join(", ")}`
      );
    }

    const relationType = relationTypeInput as RelationType;

    // Validate both entities exist and are in this project
    const [fromEntity, toEntity] = await Promise.all([
      prisma.entity.findUnique({
        where: { id: fromEntityId },
        select: { id: true, entityType: true, projectId: true },
      }),
      prisma.entity.findUnique({
        where: { id: toEntityId },
        select: { id: true, entityType: true, projectId: true },
      }),
    ]);

    if (!fromEntity || fromEntity.projectId !== projectId) {
      return notFound(`From entity not found: ${fromEntityId}`);
    }

    if (!toEntity || toEntity.projectId !== projectId) {
      return notFound(`To entity not found: ${toEntityId}`);
    }

    const crossProjectError = assertSameProject(
      fromEntity.projectId,
      toEntity.projectId,
      "relationship"
    );
    if (crossProjectError) {
      return badRequest(crossProjectError);
    }

    const fromEntityType = mapToEntityType(fromEntity.entityType);
    const toEntityType = mapToEntityType(toEntity.entityType);

    // Check for duplicate relationship
    const existingRelation = await prisma.entityRelation.findUnique({
      where: {
        projectId_fromEntityType_fromEntityId_relationType_toEntityType_toEntityId: {
          projectId,
          fromEntityType,
          fromEntityId,
          relationType,
          toEntityType,
          toEntityId,
        },
      },
    });

    if (existingRelation) {
      return conflict("This relationship already exists");
    }

    // Create relationship and emit event log in transaction
    const result = await prisma.$transaction(async (tx) => {
      const relation = await tx.entityRelation.create({
        data: {
          fromEntityType,
          fromEntityId,
          toEntityType,
          toEntityId,
          relationType,
          projectId,
        },
      });

      await tx.eventLog.create({
        data: {
          eventType: "RELATION_CREATED",
          entityType: fromEntityType,
          entityId: fromEntityId,
          actor: "human",
          projectId,
          details: {
            relationType: relationTypeInput,
            fromEntityId,
            toEntityId,
          },
        },
      });

      return relation;
    });

    return successResponse({
      id: result.id,
      fromEntityType: result.fromEntityType,
      fromEntityId: result.fromEntityId,
      toEntityType: result.toEntityType,
      toEntityId: result.toEntityId,
      relationType: result.relationType,
      createdAt: result.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("POST /api/relationships error:", error);
    return serverError();
  }
}

// =============================================================================
// DELETE /api/relationships
// =============================================================================

export async function DELETE(request: NextRequest) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) {
      return badRequest(error);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    // Body must be object
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return badRequest("Request body must be an object");
    }

    const b = body as Record<string, unknown>;

    const fromEntityId = b.fromEntityId;
    const toEntityId = b.toEntityId;
    const relationTypeInput = b.relationType;

    if (typeof fromEntityId !== "string") {
      return badRequest("fromEntityId is required and must be a string");
    }

    if (typeof toEntityId !== "string") {
      return badRequest("toEntityId is required and must be a string");
    }

    if (typeof relationTypeInput !== "string") {
      return badRequest("relationType is required and must be a string");
    }

    // Validate UUID format
    if (!UUID_RE.test(fromEntityId)) {
      return badRequest("fromEntityId must be a valid UUID");
    }

    if (!UUID_RE.test(toEntityId)) {
      return badRequest("toEntityId must be a valid UUID");
    }

    // Validate relationType against schema enum
    if (!VALID_RELATION_TYPES.includes(relationTypeInput as RelationType)) {
      return badRequest(
        `relationType must be one of: ${VALID_RELATION_TYPES.join(", ")}`
      );
    }

    const relationType = relationTypeInput as RelationType;

    // Validate both entities exist and are in this project
    const [fromEntity, toEntity] = await Promise.all([
      prisma.entity.findUnique({
        where: { id: fromEntityId },
        select: { id: true, entityType: true, projectId: true },
      }),
      prisma.entity.findUnique({
        where: { id: toEntityId },
        select: { id: true, entityType: true, projectId: true },
      }),
    ]);

    if (!fromEntity || fromEntity.projectId !== projectId) {
      return notFound(`From entity not found: ${fromEntityId}`);
    }

    if (!toEntity || toEntity.projectId !== projectId) {
      return notFound(`To entity not found: ${toEntityId}`);
    }

    const crossProjectError = assertSameProject(
      fromEntity.projectId,
      toEntity.projectId,
      "relationship"
    );
    if (crossProjectError) {
      return badRequest(crossProjectError);
    }

    const fromEntityType = mapToEntityType(fromEntity.entityType);
    const toEntityType = mapToEntityType(toEntity.entityType);

    // Check if relationship exists
    const existingRelation = await prisma.entityRelation.findUnique({
      where: {
        projectId_fromEntityType_fromEntityId_relationType_toEntityType_toEntityId: {
          projectId,
          fromEntityType,
          fromEntityId,
          relationType,
          toEntityType,
          toEntityId,
        },
      },
    });

    if (!existingRelation) {
      return notFound("Relationship not found");
    }

    await prisma.$transaction(async (tx) => {
      await tx.entityRelation.delete({
        where: {
          projectId_fromEntityType_fromEntityId_relationType_toEntityType_toEntityId: {
            projectId,
            fromEntityType,
            fromEntityId,
            relationType,
            toEntityType,
            toEntityId,
          },
        },
      });

      await tx.eventLog.create({
        data: {
          eventType: "RELATION_REMOVED",
          entityType: fromEntityType,
          entityId: fromEntityId,
          actor: "human",
          projectId,
          details: {
            relationType: relationTypeInput,
            fromEntityId,
            toEntityId,
          },
        },
      });
    });

    return successResponse({ deleted: true });
  } catch (error) {
    console.error("DELETE /api/relationships error:", error);
    return serverError();
  }
}
