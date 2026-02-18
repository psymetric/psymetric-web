/**
 * POST /api/entities/[id]/validate — Entity validation endpoint
 *
 * Phase 1 Publish Lifecycle - Chunk 1: Entity validation spine
 * - Deterministic validation only (no LLM, no network calls)
 * - Returns validation status without changing publish state
 * - Logs ENTITY_VALIDATION_FAILED event on failure
 *
 * Multi-project hardened:
 * - Resolves projectId from request
 * - Verifies entity belongs to project
 * - Uses resolved projectId for events
 * - No unsafe Prisma JSON casting
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
import { resolveProjectId } from "@/lib/project";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) {
      return badRequest(error);
    }

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
        projectId: true,
      },
    });

    if (!entity || entity.projectId !== projectId) {
      return notFound("Entity not found");
    }

    // Run deterministic validation
    const validation = await validateEntityForPublish({ entity });

    // Log validation failure event if needed (no state change)
    if (validation.status === "fail") {
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
