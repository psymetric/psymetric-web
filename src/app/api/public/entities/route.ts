/**
 * GET /api/public/entities — List published entities only (project scoped)
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
import { resolveProjectId } from "@/lib/project";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) return badRequest(error);

    const searchParams = request.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(searchParams);

    const where: Prisma.EntityWhereInput = {
      projectId,
      status: "published",
    };

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
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
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
