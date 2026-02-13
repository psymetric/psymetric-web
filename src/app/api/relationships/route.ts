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
import { RelationType } from "@prisma/client";
import type { Prisma } from "@prisma/client";

// UUID validation regex
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Valid relation types from schema
const VALID_RELATION_TYPES = Object.values(RelationType);

// =============================================================================
// GET /api/relationships
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(searchParams);

    const where: Prisma.EntityRelationWhereInput = {};

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
    let body;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    // Body must be object
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return badRequest("Request body must be an object");
    }

    // Validate required fields
    if (!body.fromEntityId || typeof body.fromEntityId !== "string") {
      return badRequest("fromEntityId is required and must be a string");
    }

    if (!body.toEntityId || typeof body.toEntityId !== "string") {
      return badRequest("toEntityId is required and must be a string");
    }

    if (!body.relationType || typeof body.relationType !== "string") {
      return badRequest("relationType is required and must be a string");
    }

    // Validate UUID format
    if (!UUID_RE.test(body.fromEntityId)) {
      return badRequest("fromEntityId must be a valid UUID");
    }

    if (!UUID_RE.test(body.toEntityId)) {
      return badRequest("toEntityId must be a valid UUID");
    }

    // Prevent self-relationships
    if (body.fromEntityId === body.toEntityId) {
      return badRequest("Cannot create relationship from entity to itself");
    }

    // Validate relationType against schema enum
    if (!VALID_RELATION_TYPES.includes(body.relationType as RelationType)) {
      return badRequest(
        `relationType must be one of: ${VALID_RELATION_TYPES.join(", ")}`
      );
    }

    // Validate both entities exist in Entity table
    const [fromEntity, toEntity] = await Promise.all([
      prisma.entity.findUnique({
        where: { id: body.fromEntityId },
        select: { id: true, entityType: true },
      }),
      prisma.entity.findUnique({
        where: { id: body.toEntityId },
        select: { id: true, entityType: true },
      }),
    ]);

    if (!fromEntity) {
      return notFound(`From entity not found: ${body.fromEntityId}`);
    }

    if (!toEntity) {
      return notFound(`To entity not found: ${body.toEntityId}`);
    }

    // Check for duplicate relationship
    const existingRelation = await prisma.entityRelation.findUnique({
      where: {
        fromEntityType_fromEntityId_relationType_toEntityType_toEntityId: {
          fromEntityType: fromEntity.entityType,
          fromEntityId: body.fromEntityId,
          relationType: body.relationType as RelationType,
          toEntityType: toEntity.entityType,
          toEntityId: body.toEntityId,
        },
      },
    });

    if (existingRelation) {
      return conflict("This relationship already exists");
    }

    // Create relationship and emit event log in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Insert EntityRelation row
      const relation = await tx.entityRelation.create({
        data: {
          fromEntityType: fromEntity.entityType,
          fromEntityId: body.fromEntityId,
          toEntityType: toEntity.entityType,
          toEntityId: body.toEntityId,
          relationType: body.relationType as RelationType,
        },
      });

      // Emit exactly ONE EventLog
      await tx.eventLog.create({
        data: {
          eventType: "RELATION_CREATED",
          entityType: fromEntity.entityType,
          entityId: body.fromEntityId,
          actor: "human",
          details: {
            relationType: body.relationType,
            fromEntityId: body.fromEntityId,
            toEntityId: body.toEntityId,
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
    let body;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    // Body must be object
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return badRequest("Request body must be an object");
    }

    // Validate required fields
    if (!body.fromEntityId || typeof body.fromEntityId !== "string") {
      return badRequest("fromEntityId is required and must be a string");
    }

    if (!body.toEntityId || typeof body.toEntityId !== "string") {
      return badRequest("toEntityId is required and must be a string");
    }

    if (!body.relationType || typeof body.relationType !== "string") {
      return badRequest("relationType is required and must be a string");
    }

    // Validate UUID format
    if (!UUID_RE.test(body.fromEntityId)) {
      return badRequest("fromEntityId must be a valid UUID");
    }

    if (!UUID_RE.test(body.toEntityId)) {
      return badRequest("toEntityId must be a valid UUID");
    }

    // Validate relationType against schema enum
    if (!VALID_RELATION_TYPES.includes(body.relationType as RelationType)) {
      return badRequest(
        `relationType must be one of: ${VALID_RELATION_TYPES.join(", ")}`
      );
    }

    // Validate both entities exist in Entity table
    const [fromEntity, toEntity] = await Promise.all([
      prisma.entity.findUnique({
        where: { id: body.fromEntityId },
        select: { id: true, entityType: true },
      }),
      prisma.entity.findUnique({
        where: { id: body.toEntityId },
        select: { id: true, entityType: true },
      }),
    ]);

    if (!fromEntity) {
      return notFound(`From entity not found: ${body.fromEntityId}`);
    }

    if (!toEntity) {
      return notFound(`To entity not found: ${body.toEntityId}`);
    }

    // Check if relationship exists
    const existingRelation = await prisma.entityRelation.findUnique({
      where: {
        fromEntityType_fromEntityId_relationType_toEntityType_toEntityId: {
          fromEntityType: fromEntity.entityType,
          fromEntityId: body.fromEntityId,
          relationType: body.relationType as RelationType,
          toEntityType: toEntity.entityType,
          toEntityId: body.toEntityId,
        },
      },
    });

    if (!existingRelation) {
      return notFound("Relationship not found");
    }

    // Delete relationship and emit event log in transaction
    await prisma.$transaction(async (tx) => {
      // Delete exactly one EntityRelation row using composite unique key
      await tx.entityRelation.delete({
        where: {
          fromEntityType_fromEntityId_relationType_toEntityType_toEntityId: {
            fromEntityType: fromEntity.entityType,
            fromEntityId: body.fromEntityId,
            relationType: body.relationType as RelationType,
            toEntityType: toEntity.entityType,
            toEntityId: body.toEntityId,
          },
        },
      });

      // Emit exactly ONE EventLog
      await tx.eventLog.create({
        data: {
          eventType: "RELATION_REMOVED",
          entityType: fromEntity.entityType,
          entityId: body.fromEntityId,
          actor: "human",
          details: {
            relationType: body.relationType,
            fromEntityId: body.fromEntityId,
            toEntityId: body.toEntityId,
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
