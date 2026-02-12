/**
 * GET /api/public/entities/[entityType]/[slug] — Get single published entity by entityType + slug
 *
 * Phase 1 public projection API - read-only, published entities only
 * - No fallback, no preview logic, no draft exposure
 * - Validates entityType and slug, returns only published entities
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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ entityType: string; slug: string }> }
) {
  try {
    const { entityType, slug } = await context.params;

    // Validate entityType
    if (!isValidEnum(entityType, VALID_CONTENT_ENTITY_TYPES)) {
      return badRequest(
        `entityType must be one of: ${VALID_CONTENT_ENTITY_TYPES.join(", ")}`
      );
    }

    // Query for published entity only
    const entity = await prisma.entity.findFirst({
      where: {
        entityType: entityType as "guide" | "concept" | "project" | "news",
        slug,
        status: "published",
      },
    });

    if (!entity) {
      return notFound("Entity not found");
    }

    return successResponse(entity);
  } catch (error) {
    console.error("GET /api/public/entities/[entityType]/[slug] error:", error);
    return serverError();
  }
}
