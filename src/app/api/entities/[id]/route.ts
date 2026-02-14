/**
 * GET /api/entities/[id]
 * PATCH /api/entities/[id]
 *
 * Multi-project hardened.
 * - Resolves projectId from request
 * - Verifies entity belongs to project
 * - All state mutations + event logs inside $transaction()
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
import { isValidEnum } from "@/lib/validation";
import { Difficulty } from "@prisma/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_FIELDS = new Set([
  "title",
  "summary",
  "difficulty",
  "repoUrl",
  "canonicalUrl",
]);

// =============================================================================
// GET
// =============================================================================

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

    const entity = await prisma.entity.findUnique({
      where: { id },
    });

    if (!entity || entity.projectId !== projectId) {
      return notFound("Entity not found");
    }

    return successResponse(entity);
  } catch (error) {
    console.error("GET /api/entities/[id] error:", error);
    return serverError();
  }
}

// =============================================================================
// PATCH
// =============================================================================

export async function PATCH(
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

    const existing = await prisma.entity.findUnique({
      where: { id },
      select: { id: true, projectId: true, difficulty: true },
    });

    if (!existing || existing.projectId !== projectId) {
      return notFound("Entity not found");
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
    const updateData: Record<string, unknown> = {};

    for (const key of Object.keys(b)) {
      if (!ALLOWED_FIELDS.has(key)) {
        return badRequest(`Field \"${key}\" is not allowed to be updated`);
      }
    }

    if (typeof b.title === "string") {
      if (b.title.trim().length === 0) {
        return badRequest("title cannot be empty");
      }
      updateData.title = b.title.trim();
    }

    if (typeof b.summary === "string" || b.summary === null) {
      updateData.summary = b.summary;
    }

    if (b.difficulty !== undefined) {
      if (!isValidEnum(b.difficulty, Object.values(Difficulty))) {
        return badRequest(
          "difficulty must be one of: " + Object.values(Difficulty).join(", ")
        );
      }
      updateData.difficulty = b.difficulty;
    }

    if (typeof b.repoUrl === "string" || b.repoUrl === null) {
      updateData.repoUrl = b.repoUrl;
    }

    if (typeof b.canonicalUrl === "string" || b.canonicalUrl === null) {
      updateData.canonicalUrl = b.canonicalUrl;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const entity = await tx.entity.update({
        where: { id },
        data: updateData,
      });

      await tx.eventLog.create({
        data: {
          eventType: "ENTITY_UPDATED",
          entityType: entity.entityType,
          entityId: entity.id,
          actor: "human",
          projectId,
          details: {
            updatedFields: Object.keys(updateData),
          },
        },
      });

      return entity;
    });

    return successResponse(updated);
  } catch (error) {
    console.error("PATCH /api/entities/[id] error:", error);
    return serverError();
  }
}
