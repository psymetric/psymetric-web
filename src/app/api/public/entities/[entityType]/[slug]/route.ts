/**
 * GET /api/public/entities/[entityType]/[slug]
 * Project-scoped public fetch
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  successResponse,
  badRequest,
  notFound,
  serverError,
} from "@/lib/api-response";
import { isValidEnum, VALID_CONTENT_ENTITY_TYPES } from "@/lib/validation";
import { resolveProjectId } from "@/lib/project";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ entityType: string; slug: string }> }
) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) return badRequest(error);

    const { entityType, slug } = await context.params;

    if (!isValidEnum(entityType, VALID_CONTENT_ENTITY_TYPES)) {
      return badRequest(
        `entityType must be one of: ${VALID_CONTENT_ENTITY_TYPES.join(", ")}`
      );
    }

    const entity = await prisma.entity.findFirst({
      where: {
        projectId,
        entityType: entityType as
          | "guide"
          | "concept"
          | "project"
          | "news",
        slug,
        status: "published",
      },
    });

    if (!entity) {
      return notFound("Entity not found");
    }

    return successResponse(entity);
  } catch (error) {
    console.error(
      "GET /api/public/entities/[entityType]/[slug] error:",
      error
    );
    return serverError();
  }
}
