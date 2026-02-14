/**
 * GET /api/entities — List entities with filtering
 * POST /api/entities — Create a draft entity
 *
 * Per docs/operations-planning-api/01-API-ENDPOINTS-AND-VALIDATION-CONTRACTS.md
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  listResponse,
  createdResponse,
  badRequest,
  serverError,
  parsePagination,
} from "@/lib/api-response";
import {
  isValidEnum,
  isNonEmptyString,
  isValidUrl,
  slugify,
  VALID_CONTENT_ENTITY_TYPES,
  VALID_ENTITY_STATUSES,
  VALID_CONCEPT_KINDS,
  VALID_DIFFICULTIES,
} from "@/lib/validation";
import { DEFAULT_PROJECT_ID } from "@/lib/project";
import type { Prisma } from "@prisma/client";

// =============================================================================
// GET /api/entities
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(searchParams);

    const where: Prisma.EntityWhereInput = {};

    const entityType = searchParams.get("entityType");
    if (entityType) {
      if (!isValidEnum(entityType, VALID_CONTENT_ENTITY_TYPES)) {
        return badRequest(`Invalid entityType: ${entityType}`);
      }
      where.entityType = entityType;
    }

    const status = searchParams.get("status");
    if (status) {
      if (!isValidEnum(status, VALID_ENTITY_STATUSES)) {
        return badRequest(`Invalid status: ${status}`);
      }
      where.status = status;
    }

    const conceptKind = searchParams.get("conceptKind");
    if (conceptKind) {
      if (!isValidEnum(conceptKind, VALID_CONCEPT_KINDS)) {
        return badRequest(`Invalid conceptKind: ${conceptKind}`);
      }
      where.conceptKind = conceptKind;
    }

    // Per API contract: search matches title or slug
    const search = searchParams.get("search");
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
      ];
    }

    const [entities, total] = await Promise.all([
      prisma.entity.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      }),
      prisma.entity.count({ where }),
    ]);

    return listResponse(entities, { page, limit, total });
  } catch (error) {
    console.error("GET /api/entities error:", error);
    return serverError();
  }
}

// =============================================================================
// POST /api/entities
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // --- Validate required fields ---
    if (!isValidEnum(body.entityType, VALID_CONTENT_ENTITY_TYPES)) {
      return badRequest(
        "entityType is required and must be one of: " +
          VALID_CONTENT_ENTITY_TYPES.join(", ")
      );
    }

    if (!isNonEmptyString(body.title)) {
      return badRequest("title is required");
    }

    // --- Validate optional fields ---
    if (body.difficulty && !isValidEnum(body.difficulty, VALID_DIFFICULTIES)) {
      return badRequest(
        "difficulty must be one of: " + VALID_DIFFICULTIES.join(", ")
      );
    }

    if (body.conceptKind) {
      if (body.entityType !== "concept") {
        return badRequest("conceptKind is only valid for concepts");
      }
      if (!isValidEnum(body.conceptKind, VALID_CONCEPT_KINDS)) {
        return badRequest(
          "conceptKind must be one of: " + VALID_CONCEPT_KINDS.join(", ")
        );
      }
    }

    // Per API contract: repoUrl required for projects
    if (body.entityType === "project") {
      if (!isValidUrl(body.repoUrl)) {
        return badRequest("repoUrl is required for projects and must be a valid URL");
      }
    }

    // --- Generate slug if not provided ---
    const slug = body.slug || slugify(body.title);

    // --- Check slug uniqueness within project + entity type ---
    const existingSlug = await prisma.entity.findUnique({
      where: {
        projectId_entityType_slug: {
          projectId: DEFAULT_PROJECT_ID,
          entityType: body.entityType,
          slug,
        },
      },
    });
    if (existingSlug) {
      return badRequest(`Slug "${slug}" already exists for ${body.entityType}`);
    }

    // --- Transactional create + event log (atomic) ---
    const entity = await prisma.$transaction(async (tx) => {
      const newEntity = await tx.entity.create({
        data: {
          entityType: body.entityType,
          title: body.title,
          slug,
          summary: body.summary || null,
          difficulty: body.difficulty || null,
          conceptKind:
            body.entityType === "concept"
              ? body.conceptKind || "standard"
              : null,
          repoUrl: body.repoUrl || null,
          status: "draft",
          projectId: DEFAULT_PROJECT_ID,
        },
      });

      await tx.eventLog.create({
        data: {
          eventType: "ENTITY_CREATED",
          entityType: body.entityType,
          entityId: newEntity.id,
          actor: "human",
          projectId: DEFAULT_PROJECT_ID,
          details: {
            title: newEntity.title,
            slug: newEntity.slug,
            ...(body.llmAssisted ? { llmAssisted: true } : {}),
          },
        },
      });

      return newEntity;
    });

    return createdResponse(entity);
  } catch (error) {
    console.error("POST /api/entities error:", error);
    return serverError();
  }
}
