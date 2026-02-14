/**
 * POST /api/entities/[id]/validate — Entity validation endpoint
 *
 * Phase 1 Publish Lifecycle - Chunk 1: Entity validation spine
 * - Deterministic validation only (no LLM, no network calls)
 * - Returns validation status without changing publish state
 * - Logs ENTITY_VALIDATION_FAILED event on failure
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  successResponse,
  notFound,
  badRequest,
  serverError,
} from "@/lib/api-response";
import { validateEntityForPublish } from "@/lib/entity-validation";
import type { Prisma } from "@prisma/client";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id || typeof id !== "string") {
      return badRequest("Invalid id parameter");
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
        projectId: true,
      },
    });

    if (!entity) {
      return notFound("Entity not found");
    }

    // Run validation
    const validation = await validateEntityForPublish({ entity });

    // Log validation failure event if needed (no state change, standalone is safe)
    if (validation.status === "fail") {
      await prisma.eventLog.create({
        data: {
          eventType: "ENTITY_VALIDATION_FAILED",
          entityType: entity.entityType,
          entityId: entity.id,
          actor: "human",
          projectId: entity.projectId,
          details: ({
            status: validation.status,
            categories: validation.categories,
            errors: validation.errors,
          } as unknown as Prisma.InputJsonValue),
        },
      });
    }

    return successResponse({
      status: validation.status,
      categories: validation.categories,
      errors: validation.errors,
    });
  } catch (error) {
    console.error("POST /api/entities/[id]/validate error:", error);
    return serverError();
  }
}
