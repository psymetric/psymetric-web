/**
 * POST /api/draft-artifacts/expire — Archive expired draft artifacts
 *
 * Phase 2 lifecycle hardening:
 * - Project-scoped via resolveProjectId() only
 * - Transactional: updates + EventLog inside prisma.$transaction()
 * - Deterministic selection ordering: expiresAt asc, id asc
 * - Non-disclosure preserved (no cross-project access)
 *
 * Notes:
 * - No background jobs. This is an explicit operator/system endpoint.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  badRequest,
  serverError,
  successResponse,
} from "@/lib/api-response";
import { resolveProjectId } from "@/lib/project";
import {
  ActorType,
  DraftArtifactStatus,
  EntityType,
  EventType,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";

const MAX_LIMIT = 500;

function parseLimit(searchParams: URLSearchParams) {
  const raw = searchParams.get("limit");
  if (!raw) return 100;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) return 100;
  return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

export async function POST(request: NextRequest) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) {
      return badRequest(error);
    }

    const limit = parseLimit(request.nextUrl.searchParams);
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      // Deterministic selection of candidates
      const candidates = await tx.draftArtifact.findMany({
        where: {
          projectId,
          status: DraftArtifactStatus.draft,
          deletedAt: null,
          expiresAt: { lt: now },
        },
        orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
        take: limit,
        select: { id: true },
      });

      if (candidates.length === 0) {
        return { expiredIds: [] as string[] };
      }

      const expiredIds = candidates.map((c) => c.id);

      // Update status for all selected artifacts.
      // Note: updateMany is safe here because we are selecting IDs deterministically
      // and restricting to status=draft + expiresAt<now.
      await tx.draftArtifact.updateMany({
        where: {
          id: { in: expiredIds },
          projectId,
          status: DraftArtifactStatus.draft,
          deletedAt: null,
        },
        data: { status: DraftArtifactStatus.archived },
      });

      const details: Prisma.InputJsonObject = {
        expiredAt: now.toISOString(),
      };

      await tx.eventLog.createMany({
        data: expiredIds.map((id) => ({
          eventType: EventType.DRAFT_EXPIRED,
          entityType: EntityType.draftArtifact,
          entityId: id,
          actor: ActorType.system,
          projectId,
          details,
        })),
      });

      return { expiredIds };
    });

    return successResponse(
      {
        expiredCount: result.expiredIds.length,
        expiredIds: result.expiredIds,
        limit,
      },
      200
    );
  } catch (err) {
    console.error("POST /api/draft-artifacts/expire error:", err);
    return serverError();
  }
}
