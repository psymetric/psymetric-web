/**
 * GET /api/public/entities — List published entities only (public projection)
 *
 * Phase 1 public projection API - read-only, published entities only
 * - No writes, no event logging, no aggregation
 * - Mirrors existing GET list patterns for consistency
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  listResponse,
  badRequest,
  serverError,
  parsePagination,
} from "@/lib/api-response";
import { isValidEnum, VALID_CONTENT_ENTITY_TYPES } from "@/lib/validation";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(searchParams);

    const where: Prisma.EntityWhereInput = {
      status: "published",
    };

    // Optional entityType filter
    const entityType = searchParams.get("entityType");
    if (entityType) {
      if (!isValidEnum(entityType, VALID_CONTENT_ENTITY_TYPES)) {
        return badRequest(
          `entityType must be one of: ${VALID_CONTENT_ENTITY_TYPES.join(", ")}`
        );
      }
      where.entityType = entityType;
    }

    const [entities, total] = await Promise.all([
      prisma.entity.findMany({
        where,
        orderBy: [
          { publishedAt: "desc" },
          { id: "desc" },
        ],
        skip,
        take: limit,
      }),
      prisma.entity.count({ where }),
    ]);

    return listResponse(entities, { page, limit, total });
  } catch (error) {
    console.error("GET /api/public/entities error:", error);
    return serverError();
  }
}
