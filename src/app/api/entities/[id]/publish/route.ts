/**
 * POST /api/entities/[id]/publish — Final publish action (human-gated)
 *
 * Phase 1 Publish Lifecycle - Chunk 3: Publish endpoint
 * - Human-gated publish with optional token authentication
 * - Enforces state transitions (publish_requested -> published)
 * - Sets publishedAt timestamp and canonical URL
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  successResponse,
  notFound,
  errorResponse,
  unauthorized,
  serverError,
} from "@/lib/api-response";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id || typeof id !== "string") {
      return errorResponse("BAD_REQUEST", "Invalid id parameter", 400);
    }

    // Auth guard: Optional PUBLISH_TOKEN check
    const requiredToken = process.env.PUBLISH_TOKEN;
    if (requiredToken) {
      const auth = request.headers.get("authorization") ?? "";
      const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
      if (token !== requiredToken) {
        return unauthorized("Invalid or missing publish token");
      }
    }

    // Load entity
    const entity = await prisma.entity.findUnique({
      where: { id },
      select: {
        id: true,
        entityType: true,
        slug: true,
        status: true,
        canonicalUrl: true,
        projectId: true,
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
        `Cannot publish from status '${entity.status}'. Entity must be in 'publish_requested' status.`,
        409
      );
    }

    // Guard: slug is required for canonicalUrl generation
    if (!entity.slug || entity.slug.trim().length === 0) {
      return errorResponse(
        "VALIDATION_FAILED",
        "Cannot publish: slug is required",
        409
      );
    }

    const now = new Date();
    
    // Generate canonical URL if not already set
    let canonicalUrl = entity.canonicalUrl;
    if (!canonicalUrl) {
      const urlMap = {
        guide: `/guides/${entity.slug}`,
        concept: `/concepts/${entity.slug}`,
        project: `/projects/${entity.slug}`,
        news: `/news/${entity.slug}`,
      };
      canonicalUrl = urlMap[entity.entityType as keyof typeof urlMap];
    }

    // Prepare event details
    const eventDetails: { from: string; to: string; canonicalUrl?: string } = {
      from: "publish_requested",
      to: "published",
    };
    if (canonicalUrl) {
      eventDetails.canonicalUrl = canonicalUrl;
    }

    // Transactional publish + event log (atomic)
    const updatedEntity = await prisma.$transaction(async (tx) => {
      const updated = await tx.entity.update({
        where: { id },
        data: {
          status: "published",
          publishedAt: now,
          canonicalUrl,
        },
      });

      await tx.eventLog.create({
        data: {
          eventType: "ENTITY_PUBLISHED",
          entityType: entity.entityType,
          entityId: entity.id,
          actor: "human",
          projectId: entity.projectId,
          details: eventDetails,
        },
      });

      return updated;
    });

    return successResponse({
      id: updatedEntity.id,
      status: updatedEntity.status,
      publishedAt: updatedEntity.publishedAt?.toISOString(),
      canonicalUrl: updatedEntity.canonicalUrl,
      updatedAt: updatedEntity.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("POST /api/entities/[id]/publish error:", error);
    return serverError();
  }
}
