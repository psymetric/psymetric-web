/**
 * GET /api/entities/[id] — Read single entity
 * PATCH /api/entities/[id] — Update allowlisted editorial fields only
 *
 * Phase 1 deterministic endpoints
 * - GET returns full entity object
 * - PATCH updates only allowlisted fields: title, summary, contentRef, canonicalUrl, difficulty, repoUrl
 * - No lifecycle transitions, no status changes, no publish logic
 * - Strict validation and logging
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  successResponse,
  badRequest,
  notFound,
  serverError,
} from "@/lib/api-response";
import { isNonEmptyString, isValidEnum, isValidUrl, VALID_DIFFICULTIES } from "@/lib/validation";

// UUID validation regex
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// =============================================================================
// GET /api/entities/[id]
// =============================================================================

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id || typeof id !== "string") {
      return badRequest("Invalid id parameter");
    }

    if (!UUID_RE.test(id)) {
      return badRequest("id must be a valid UUID");
    }

    const entity = await prisma.entity.findUnique({
      where: { id },
    });

    if (!entity) {
      return notFound("Entity not found");
    }

    return successResponse(entity);
  } catch (error) {
    console.error("GET /api/entities/[id] error:", error);
    return serverError();
  }
}

// =============================================================================
// PATCH /api/entities/[id]
// =============================================================================

// Strict allowlist of updateable fields
const ALLOWED_FIELDS = ["title", "summary", "contentRef", "canonicalUrl", "difficulty", "repoUrl"] as const;
type AllowedField = (typeof ALLOWED_FIELDS)[number];

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id || typeof id !== "string") {
      return badRequest("Invalid id parameter");
    }

    if (!UUID_RE.test(id)) {
      return badRequest("id must be a valid UUID");
    }

    // Parse request body safely
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    if (typeof body !== "object" || body === null) {
      return badRequest("Invalid JSON body");
    }

    const requestFields = body as Record<string, unknown>;

    // Validate allowlist - check for any non-allowed fields
    const providedFields = Object.keys(requestFields);
    const invalidFields = providedFields.filter(
      (field) => !ALLOWED_FIELDS.includes(field as AllowedField)
    );

    if (invalidFields.length > 0) {
      return badRequest("Invalid update fields");
    }

    // Must include at least one allowed field
    if (providedFields.length === 0) {
      return badRequest("Must provide at least one field to update");
    }

    // Validate individual fields
    const data: Record<string, string | null> = {};

    if (requestFields.title !== undefined) {
      if (typeof requestFields.title !== "string" || !isNonEmptyString(requestFields.title)) {
        return badRequest("title must be a non-empty string");
      }
      data.title = requestFields.title;
    }

    if (requestFields.summary !== undefined) {
      if (typeof requestFields.summary !== "string") {
        return badRequest("summary must be a string");
      }
      data.summary = requestFields.summary;
    }

    if (requestFields.contentRef !== undefined) {
      if (typeof requestFields.contentRef !== "string" || !isNonEmptyString(requestFields.contentRef)) {
        return badRequest("contentRef must be a non-empty string");
      }
      data.contentRef = requestFields.contentRef;
    }

    if (requestFields.canonicalUrl !== undefined) {
      if (typeof requestFields.canonicalUrl !== "string") {
        return badRequest("canonicalUrl must be a string");
      }
      // Accept paths (/foo/bar) or full URLs (https://...)
      if (!requestFields.canonicalUrl.startsWith("/") && !requestFields.canonicalUrl.startsWith("https://")) {
        return badRequest("canonicalUrl must start with '/' or 'https://'");
      }
      data.canonicalUrl = requestFields.canonicalUrl;
    }

    if (requestFields.difficulty !== undefined) {
      if (typeof requestFields.difficulty !== "string" || !isValidEnum(requestFields.difficulty, VALID_DIFFICULTIES)) {
        return badRequest("difficulty must be one of: " + VALID_DIFFICULTIES.join(", "));
      }
      data.difficulty = requestFields.difficulty;
    }

    if (requestFields.repoUrl !== undefined) {
      if (typeof requestFields.repoUrl !== "string" || !isValidUrl(requestFields.repoUrl)) {
        return badRequest("repoUrl must be a valid URL");
      }
      data.repoUrl = requestFields.repoUrl;
    }

    // Transactional update + event log (atomic)
    // Load entity to get projectId for event log
    const existingEntity = await prisma.entity.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    });

    if (!existingEntity) {
      return notFound("Entity not found");
    }

    const updatedEntity = await prisma.$transaction(async (tx) => {
      const entity = await tx.entity.update({
        where: { id },
        data,
      });

      await tx.eventLog.create({
        data: {
          eventType: "ENTITY_UPDATED",
          entityType: entity.entityType,
          entityId: entity.id,
          actor: "human",
          projectId: existingEntity.projectId,
          details: {
            updatedFields: Object.keys(data),
          },
        },
      });

      return entity;
    });

    return successResponse(updatedEntity);
  } catch (error) {
    // Handle Prisma not found error
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return notFound("Entity not found");
    }

    console.error("PATCH /api/entities/[id] error:", error);
    return serverError();
  }
}
