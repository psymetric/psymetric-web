/**
 * POST /api/entities/[id]/request-publish — Request entity for publish review
 *
 * Phase 1 Publish Lifecycle - Chunk 2: Publish review flow
 * - Validates entity before allowing publish request
 * - Enforces state transitions (draft -> publish_requested)
 * - EventLog only on actual state change (per INV-3.2)
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
import { resolveProjectId } from "@/lib/project";
import { UUID_RE } from "@/lib/constants";


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

    // Run validation (projectId-scoped per §1.2)
    const validation = await validateEntityForPublish({ entity, projectId });

    if (validation.status === "fail") {
      // Return 409 with validation errors (no EventLog - no state change per INV-3.2)
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
