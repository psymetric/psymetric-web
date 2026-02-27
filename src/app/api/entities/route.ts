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
  slugify,
  VALID_CONTENT_ENTITY_TYPES,
  VALID_ENTITY_STATUSES,
  VALID_CONCEPT_KINDS,
} from "@/lib/validation";
import { resolveProjectId } from "@/lib/project";
import { CreateEntitySchema } from "@/lib/schemas/entity";
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

    const parsed = CreateEntitySchema.safeParse(body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      return badRequest("Validation failed", [
        ...flat.formErrors.map((msg) => ({
          code: "VALIDATION_ERROR" as const,
          message: msg,
        })),
        ...Object.entries(flat.fieldErrors).flatMap(([field, messages]) =>
          (messages ?? []).map((msg) => ({
            code: "VALIDATION_ERROR" as const,
            field,
            message: msg,
          }))
        ),
      ]);
    }

    const data = parsed.data;

    // --- Cross-field validation ---
    if (data.conceptKind && data.entityType !== "concept") {
      return badRequest("conceptKind is only valid for concepts");
    }

    if (data.entityType === "project" && !data.repoUrl) {
      return badRequest(
        "repoUrl is required for projects and must be a valid URL"
      );
    }

    // --- Generate slug if not provided ---
    const slug = data.slug || slugify(data.title);

    // --- Check slug uniqueness within project + entity type ---
    const existingSlug = await prisma.entity.findUnique({
      where: {
        projectId_entityType_slug: {
          projectId,
          entityType: data.entityType,
          slug,
        },
      },
    });
    if (existingSlug) {
      return badRequest(`Slug "${slug}" already exists for ${data.entityType}`);
    }

    // --- Transactional create + event log (atomic) ---
    const entity = await prisma.$transaction(async (tx) => {
      const newEntity = await tx.entity.create({
        data: {
          entityType: data.entityType,
          title: data.title,
          slug,
          summary: data.summary || null,
          difficulty: data.difficulty || null,
          conceptKind:
            data.entityType === "concept"
              ? data.conceptKind || "standard"
              : null,
          repoUrl: data.repoUrl || null,
          status: "draft",
          projectId,
        },
      });

      await tx.eventLog.create({
        data: {
          eventType: "ENTITY_CREATED",
          entityType: data.entityType,
          entityId: newEntity.id,
          actor: "human",
          projectId,
          details: {
            title: newEntity.title,
            slug: newEntity.slug,
            ...(data.llmAssisted ? { llmAssisted: true } : {}),
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
