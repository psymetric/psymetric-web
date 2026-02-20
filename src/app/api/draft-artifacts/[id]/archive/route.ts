/**
 * PATCH /api/draft-artifacts/:id/archive — Archive a draft artifact (draft -> archived)
 *
 * Phase 2 lifecycle hardening:
 * - Project-scoped via resolveProjectId() only
 * - Non-disclosure: cross-project IDs return 404
 * - Transactional: status update + EventLog inside prisma.$transaction()
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  badRequest,
  notFound,
  serverError,
  successResponse,
} from "@/lib/api-response";
import { resolveProjectId } from "@/lib/project";
import { ActorType, DraftArtifactStatus, EntityType, EventType } from "@prisma/client";
import type { Prisma } from "@prisma/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) {
      return badRequest(error);
    }

    const { id: draftId } = await context.params;
    if (!UUID_RE.test(draftId)) {
      return badRequest("Draft artifact id must be a valid UUID");
    }

    // Transactional: read scoped artifact, enforce state, update, log event
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.draftArtifact.findFirst({
        where: {
          id: draftId,
          projectId,
          deletedAt: null,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!existing) {
        return { kind: "not_found" as const };
      }

      if (existing.status !== DraftArtifactStatus.draft) {
        return { kind: "already_archived" as const };
      }

      const updated = await tx.draftArtifact.update({
        where: { id: draftId },
        data: { status: DraftArtifactStatus.archived },
        select: { id: true, status: true, updatedAt: true },
      });

      const details: Prisma.InputJsonObject = {
        previousStatus: DraftArtifactStatus.draft,
      };

      await tx.eventLog.create({
        data: {
          eventType: EventType.ENTITY_ARCHIVED,
          entityType: EntityType.draftArtifact,
          entityId: updated.id,
          actor: ActorType.system,
          projectId,
          details,
        },
      });

      return { kind: "ok" as const, updated };
    });

    if (result.kind === "not_found") {
      // Cross-project non-disclosure: same as not-found
      return notFound("Draft artifact not found");
    }

    if (result.kind === "already_archived") {
      return badRequest("Draft artifact is already archived");
    }

    return successResponse(
      {
        id: result.updated.id,
        status: result.updated.status,
        archivedAt: result.updated.updatedAt,
      },
      200
    );
  } catch (err) {
    console.error("PATCH /api/draft-artifacts/:id/archive error:", err);
    return serverError();
  }
}
