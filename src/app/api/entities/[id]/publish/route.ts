/**
 * POST /api/entities/[id]/publish — Final publish action (human-gated)
 *
 * Multi-project hardened:
 * - Resolves projectId from request
 * - Verifies entity belongs to project
 * - Enforces state transitions
 * - All mutation + event log inside $transaction()
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  successResponse,
  notFound,
  errorResponse,
  unauthorized,
  badRequest,
  serverError,
} from "@/lib/api-response";
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

    // Optional PUBLISH_TOKEN guard
    const requiredToken = process.env.PUBLISH_TOKEN;
    if (requiredToken) {
      const auth = request.headers.get("authorization") ?? "";
      const token = auth.startsWith("Bearer ")
        ? auth.slice("Bearer ".length)
        : "";
      if (token !== requiredToken) {
        return unauthorized("Invalid or missing publish token");
      }
    }

    // Load entity with project verification
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

    if (!entity || entity.projectId !== projectId) {
      return notFound("Entity not found");
    }

    if (entity.status !== "publish_requested") {
      return errorResponse(
        "INVALID_STATE_TRANSITION",
        `Cannot publish from status '${entity.status}'. Must be 'publish_requested'.`,
        409
      );
    }

    if (!entity.slug || entity.slug.trim().length === 0) {
      return errorResponse(
        "VALIDATION_FAILED",
        "Cannot publish: slug is required",
        409
      );
    }

    const now = new Date();

    let canonicalUrl = entity.canonicalUrl;
    if (!canonicalUrl) {
      const urlMap = {
        guide: `/guides/${entity.slug}`,
        concept: `/concepts/${entity.slug}`,
        project: `/projects/${entity.slug}`,
        news: `/news/${entity.slug}`,
      };
      canonicalUrl =
        urlMap[entity.entityType as keyof typeof urlMap] ?? undefined;
    }

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
          projectId,
          details: {
            from: "publish_requested",
            to: "published",
            canonicalUrl,
          },
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
