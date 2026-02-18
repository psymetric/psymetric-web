/**
 * POST /api/entities/[id]/request-publish — Request entity for publish review
 *
 * Phase 1 Publish Lifecycle - Chunk 2: Publish review flow
 * - Validates entity before allowing publish request
 * - Enforces state transitions (draft -> publish_requested)
 * - Logs validation failures and publish requests
 *
 * Multi-project hardened:
 * - Resolves projectId from request
 * - Verifies entity belongs to project
 * - Uses resolved projectId for all events
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  successResponse,
  notFound,
  errorResponse,
  badRequest,
  serverError,
} from "@/lib/api-response";
import { validateEntityForPublish } from "@/lib/entity-validation";
import type { Prisma } from "@prisma/client";
import { resolveProjectId } from "@/lib/project";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) return badRequest(error);

    const { id } = await context.params;

    if (!id || typeof id !== "string" || !UUID_RE.test(id)) {
      return badRequest("id must be a valid UUID");
    }

    // Load entity (and verify ownership)
    const entity = await prisma.entity.findUnique({
      where: { id },
      select: {
        id: true,
        entityType: true,
        title: true,
        slug: true,
        repoUrl: true,
        contentRef: true,
        status: true,
        projectId: true,
        updatedAt: true,
      },
    });

    if (!entity || entity.projectId !== projectId) {
      return notFound("Entity not found");
    }

    // Enforce state transition: only from draft
    if (entity.status !== "draft") {
      return errorResponse(
        "INVALID_STATE_TRANSITION",
        `Cannot request publish from status '${entity.status}'. Entity must be in 'draft' status.`,
        409
      );
    }

    // Run validation
    const validation = await validateEntityForPublish({ entity });

    if (validation.status === "fail") {
      // Log validation failure event (no state change)
      const errorsJson: Prisma.InputJsonArray = validation.errors.map((e) => ({
        code: e.code,
        category: e.category,
        level: e.level,
        message: e.message,
      }));

      const details: Prisma.InputJsonObject = {
        status: validation.status,
        categories: validation.categories,
        errors: errorsJson,
      };

      await prisma.eventLog.create({
        data: {
          eventType: "ENTITY_VALIDATION_FAILED",
          entityType: entity.entityType,
          entityId: entity.id,
          actor: "human",
          projectId,
          details,
        },
      });

      // Return 409 with validation errors
      return errorResponse(
        "VALIDATION_FAILED",
        "Cannot request publish: validation failed",
        409,
        validation.errors
      );
    }

    // Transactional status update + event log (atomic)
    const updatedEntity = await prisma.$transaction(async (tx) => {
      const updated = await tx.entity.update({
        where: { id },
        data: {
          status: "publish_requested",
        },
      });

      await tx.eventLog.create({
        data: {
          eventType: "ENTITY_PUBLISH_REQUESTED",
          entityType: entity.entityType,
          entityId: entity.id,
          actor: "human",
          projectId,
          details: {
            from: "draft",
            to: "publish_requested",
          },
        },
      });

      return updated;
    });

    return successResponse({
      id: updatedEntity.id,
      status: updatedEntity.status,
      updatedAt: updatedEntity.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("POST /api/entities/[id]/request-publish error:", error);
    return serverError();
  }
}
