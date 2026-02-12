/**
 * POST /api/entities/[id]/reject — Reject publish request
 *
 * Phase 1 Publish Lifecycle - Chunk 2: Publish review flow
 * - Rejects entity publish request and returns to draft status
 * - Enforces state transitions (publish_requested -> draft)
 * - Logs rejection with optional reason
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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id || typeof id !== "string") {
      return errorResponse("BAD_REQUEST", "Invalid id parameter", 400);
    }

    // Parse optional reason from request body
    let reason: string | undefined;
    try {
      const body = await request.json();
      if (body.reason && typeof body.reason === "string" && body.reason.trim().length > 0) {
        reason = body.reason.trim();
      }
    } catch {
      // JSON parsing failed or no body - continue without reason
    }

    // Load entity
    const entity = await prisma.entity.findUnique({
      where: { id },
      select: {
        id: true,
        entityType: true,
        status: true,
        updatedAt: true,
      },
    });

    if (!entity) {
      return notFound("Entity not found");
    }

    // Enforce state transition: only from publish_requested
    if (entity.status !== "publish_requested") {
      return errorResponse(
        "INVALID_STATE_TRANSITION",
        `Cannot reject from status '${entity.status}'. Entity must be in 'publish_requested' status.`,
        409
      );
    }

    // Update entity status back to draft
    const updatedEntity = await prisma.entity.update({
      where: { id },
      data: {
        status: "draft",
      },
    });

    // Log rejection event
    const eventDetails: { from: string; to: string; reason?: string } = {
      from: "publish_requested",
      to: "draft",
    };
    
    if (reason) {
      eventDetails.reason = reason;
    }

    await logEvent({
      eventType: "ENTITY_PUBLISH_REJECTED",
      entityType: entity.entityType as "guide" | "concept" | "project" | "news",
      entityId: entity.id,
      actor: "human",
      details: eventDetails,
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
