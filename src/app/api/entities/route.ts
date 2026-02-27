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
import { resolveProjectId } from "@/lib/project";
import type { Prisma } from "@prisma/client";

// =============================================================================
// GET /api/entities
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
    const where: Prisma.EntityWhereInput = { projectId };

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

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return badRequest("Request body must be an object");
    }

    const b = body as Record<string, unknown>;

    // --- Validate required fields ---
    if (!isValidEnum(b.entityType, VALID_CONTENT_ENTITY_TYPES)) {
      return badRequest(
        "entityType is required and must be one of: " +
          VALID_CONTENT_ENTITY_TYPES.join(", ")
      );
    }

    if (!isNonEmptyString(b.title)) {
      return badRequest("title is required");
    }

    // --- Validate optional fields ---
    if (b.difficulty && !isValidEnum(b.difficulty, VALID_DIFFICULTIES)) {
      return badRequest(
        "difficulty must be one of: " + VALID_DIFFICULTIES.join(", ")
      );
    }

    if (b.conceptKind) {
      if (b.entityType !== "concept") {
        return badRequest("conceptKind is only valid for concepts");
      }
      if (!isValidEnum(b.conceptKind, VALID_CONCEPT_KINDS)) {
        return badRequest(
          "conceptKind must be one of: " + VALID_CONCEPT_KINDS.join(", ")
        );
      }
    }

    // Per API contract: repoUrl required for projects
    if (b.entityType === "project") {
      if (!isValidUrl(b.repoUrl)) {
        return badRequest(
          "repoUrl is required for projects and must be a valid URL"
        );
      }
    }

    // --- Generate slug if not provided ---
    const slug = (b.slug as string) || slugify(b.title as string);

    // --- Check slug uniqueness within project + entity type ---
    const existingSlug = await prisma.entity.findUnique({
      where: {
        projectId_entityType_slug: {
          projectId,
          entityType: b.entityType as string,
          slug,
        },
      },
    });
    if (existingSlug) {
      return badRequest(`Slug "${slug}" already exists for ${b.entityType}`);
    }

    // --- Transactional create + event log (atomic) ---
    const entity = await prisma.$transaction(async (tx) => {
      const newEntity = await tx.entity.create({
        data: {
          entityType: b.entityType as string,
          title: b.title as string,
          slug,
          summary: (b.summary as string) || null,
          difficulty: (b.difficulty as string) || null,
          conceptKind:
            b.entityType === "concept"
              ? (b.conceptKind as string) || "standard"
              : null,
          repoUrl: (b.repoUrl as string) || null,
          status: "draft",
          projectId,
        },
      });

      await tx.eventLog.create({
        data: {
          eventType: "ENTITY_CREATED",
          entityType: b.entityType as string,
          entityId: newEntity.id,
          actor: "human",
          projectId,
          details: {
            title: newEntity.title,
            slug: newEntity.slug,
            ...(b.llmAssisted ? { llmAssisted: true } : {}),
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
