/**
 * POST /api/entities/[id]/reject — Reject publish request
 *
 * Multi-project hardened:
 * - Resolves projectId from request
 * - Verifies entity belongs to project
 * - Enforces state transition (publish_requested -> draft)
 * - All mutation + event log inside $transaction()
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
import { resolveProjectId } from "@/lib/project";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readReason(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  const r = (body as Record<string, unknown>).reason;
  if (typeof r !== "string") return undefined;
  const trimmed = r.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

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

    // Parse optional reason from request body (never throws lint via any)
    let reason: string | undefined;
    try {
      const body: unknown = await request.json();
      reason = readReason(body);
    } catch {
      // Ignore invalid JSON body; reason remains undefined
    }

    const entity = await prisma.entity.findUnique({
      where: { id },
      select: {
        id: true,
        entityType: true,
        status: true,
        projectId: true,
        updatedAt: true,
      },
    });

    if (!entity || entity.projectId !== projectId) {
      return notFound("Entity not found");
    }

    if (entity.status !== "publish_requested") {
      return errorResponse(
        "INVALID_STATE_TRANSITION",
        `Cannot reject from status '${entity.status}'. Must be 'publish_requested'.`,
        409
      );
    }

    const eventDetails: { from: string; to: string; reason?: string } = {
      from: "publish_requested",
      to: "draft",
    };
    if (reason) {
      eventDetails.reason = reason;
    }

    const updatedEntity = await prisma.$transaction(async (tx) => {
      const updated = await tx.entity.update({
        where: { id },
        data: {
          status: "draft",
        },
      });

      await tx.eventLog.create({
        data: {
          eventType: "ENTITY_PUBLISH_REJECTED",
          entityType: entity.entityType,
          entityId: entity.id,
          actor: "human",
          projectId,
          details: eventDetails,
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
    console.error("POST /api/entities/[id]/reject error:", error);
    return serverError();
  }
}
