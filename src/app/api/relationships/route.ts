/**
 * POST /api/relationships — Create a relationship
 * GET /api/relationships — List relationships for an entity
 *
 * Per docs/operations-planning-api/01-API-ENDPOINTS-AND-VALIDATION-CONTRACTS.md
 * Validates against canonical relation types from docs/07-RELATIONSHIP-AND-EVENT-VOCABULARY.md
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  createdResponse,
  listResponse,
  badRequest,
  notFound,
  conflict,
  serverError,
  parsePagination,
} from "@/lib/api-response";
import { logEvent } from "@/lib/events";
import {
  isNonEmptyString,
  VALID_RELATION_TYPES_BY_PAIR,
} from "@/lib/validation";

// All valid entity types that can participate in relationships
const VALID_FROM_ENTITY_TYPES = [
  "guide",
  "concept",
  "project",
  "news",
  "distributionEvent",
  "video",
] as const;

const VALID_TO_ENTITY_TYPES = [
  "guide",
  "concept",
  "project",
  "news",
  "sourceItem",
] as const;

// =============================================================================
// POST /api/relationships
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // --- Validate required fields ---
    if (!body.fromEntityType || !VALID_FROM_ENTITY_TYPES.includes(body.fromEntityType)) {
      return badRequest(
        "fromEntityType is required and must be one of: " +
          VALID_FROM_ENTITY_TYPES.join(", ")
      );
    }

    if (!isNonEmptyString(body.fromEntityId)) {
      return badRequest("fromEntityId is required");
    }

    if (!body.toEntityType || !VALID_TO_ENTITY_TYPES.includes(body.toEntityType)) {
      return badRequest(
        "toEntityType is required and must be one of: " +
          VALID_TO_ENTITY_TYPES.join(", ")
      );
    }

    if (!isNonEmptyString(body.toEntityId)) {
      return badRequest("toEntityId is required");
    }

    if (!isNonEmptyString(body.relationType)) {
      return badRequest("relationType is required");
    }

    // --- Validate relationType is valid for this entity type pair ---
    const allowedTypes =
      VALID_RELATION_TYPES_BY_PAIR[body.fromEntityType]?.[body.toEntityType];

    if (!allowedTypes || !allowedTypes.includes(body.relationType)) {
      return badRequest(
        `relationType "${body.relationType}" is not valid for ` +
          `${body.fromEntityType} → ${body.toEntityType}. ` +
          (allowedTypes
            ? `Allowed: ${allowedTypes.join(", ")}`
            : "No relationships defined for this entity type pair")
      );
    }

    // --- Validate both entities exist ---
    const fromExists = await entityExists(body.fromEntityType, body.fromEntityId);
    if (!fromExists) {
      return notFound(
        `From entity not found: ${body.fromEntityType} ${body.fromEntityId}`
      );
    }

    const toExists = await entityExists(body.toEntityType, body.toEntityId);
    if (!toExists) {
      return notFound(
        `To entity not found: ${body.toEntityType} ${body.toEntityId}`
      );
    }

    // --- Check for duplicate relationship ---
    const existingRelation = await prisma.entityRelation.findUnique({
      where: {
        fromEntityType_fromEntityId_relationType_toEntityType_toEntityId: {
          fromEntityType: body.fromEntityType,
          fromEntityId: body.fromEntityId,
          relationType: body.relationType,
          toEntityType: body.toEntityType,
          toEntityId: body.toEntityId,
        },
      },
    });

    if (existingRelation) {
      return conflict("This relationship already exists");
    }

    // --- Create relationship ---
    const relation = await prisma.entityRelation.create({
      data: {
        fromEntityType: body.fromEntityType,
        fromEntityId: body.fromEntityId,
        toEntityType: body.toEntityType,
        toEntityId: body.toEntityId,
        relationType: body.relationType,
        notes: body.notes || null,
      },
    });

    // --- Log RELATION_CREATED event ---
    await logEvent({
      eventType: "RELATION_CREATED",
      entityType: body.fromEntityType,
      entityId: body.fromEntityId,
      actor: "human",
      details: {
        relationType: body.relationType,
        toEntityType: body.toEntityType,
        toEntityId: body.toEntityId,
      },
    });

    return createdResponse({
      id: relation.id,
      fromEntityType: relation.fromEntityType,
      fromEntityId: relation.fromEntityId,
      toEntityType: relation.toEntityType,
      toEntityId: relation.toEntityId,
      relationType: relation.relationType,
      createdAt: relation.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("POST /api/relationships error:", error);
    return serverError();
  }
}

// =============================================================================
// GET /api/relationships
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(searchParams);

    const entityId = searchParams.get("entityId");
    if (!entityId) {
      return badRequest("entityId query parameter is required");
    }

    const direction = searchParams.get("direction") || "both";
    if (!["from", "to", "both"].includes(direction)) {
      return badRequest("direction must be one of: from, to, both");
    }

    const relationType = searchParams.get("relationType");

    const where: Prisma.EntityRelationWhereInput = {};

    if (direction === "from") {
      where.fromEntityId = entityId;
    } else if (direction === "to") {
      where.toEntityId = entityId;
    } else {
      where.OR = [{ fromEntityId: entityId }, { toEntityId: entityId }];
    }

    if (relationType) {
      where.relationType = relationType as Prisma.EntityRelationWhereInput["relationType"];
    }

    const [relations, total] = await Promise.all([
      prisma.entityRelation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.entityRelation.count({ where }),
    ]);

    return listResponse(relations, { page, limit, total });
  } catch (error) {
    console.error("GET /api/relationships error:", error);
    return serverError();
  }
}

// =============================================================================
// Helpers
// =============================================================================

async function entityExists(
  entityType: string,
  entityId: string
): Promise<boolean> {
  if (["guide", "concept", "project", "news"].includes(entityType)) {
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { id: true },
    });
    return entity !== null;
  }

  if (entityType === "sourceItem") {
    const source = await prisma.sourceItem.findUnique({
      where: { id: entityId },
      select: { id: true },
    });
    return source !== null;
  }

  // TODO: Add existence checks for distributionEvent, video, sourceFeed
  // when those entities are implemented in later sprints.
  return false;
}
