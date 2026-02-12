/**
 * POST /api/entities/[id]/request-publish — Request entity for publish review
 *
 * Phase 1 Publish Lifecycle - Chunk 2: Publish review flow
 * - Validates entity before allowing publish request
 * - Enforces state transitions (draft -> publish_requested)
 * - Logs validation failures and publish requests
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  successResponse,
  notFound,
  errorResponse,
  serverError,
} from "@/lib/api-response";
import { logEvent } from "@/lib/events";
import { validateEntityForPublish } from "@/lib/entity-validation";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id || typeof id !== "string") {
      return errorResponse("BAD_REQUEST", "Invalid id parameter", 400);
    }

    // Load entity
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
        updatedAt: true,
      },
    });

    if (!entity) {
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
      // Log validation failure event
      await logEvent({
        eventType: "ENTITY_VALIDATION_FAILED",
        entityType: entity.entityType as "guide" | "concept" | "project" | "news",
        entityId: entity.id,
        actor: "human",
        details: {
          status: validation.status,
          categories: validation.categories,
          errors: validation.errors,
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

    // Update entity status to publish_requested
    const updatedEntity = await prisma.entity.update({
      where: { id },
      data: {
        status: "publish_requested",
      },
    });

    // Log publish request event
    await logEvent({
      eventType: "ENTITY_PUBLISH_REQUESTED",
      entityType: entity.entityType as "guide" | "concept" | "project" | "news",
      entityId: entity.id,
      actor: "human",
      details: {
        from: "draft",
        to: "publish_requested",
      },
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
