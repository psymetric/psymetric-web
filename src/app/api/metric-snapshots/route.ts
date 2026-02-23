/**
 * GET /api/metric-snapshots — List MetricSnapshot (read-only)
 *
 * Phase 3: Deterministic, project-scoped read surface.
 *
 * Hard constraints:
 * - No schema changes
 * - Project scoping via resolveProjectId()
 * - Deterministic ordering: createdAt asc, id asc
 * - No mutation, no event logging
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  listResponse,
  badRequest,
  serverError,
} from "@/lib/api-response";
import { resolveProjectId } from "@/lib/project";
import { VALID_METRIC_TYPES, isValidEnum } from "@/lib/validation";
import type { Prisma } from "@prisma/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_LIMIT = 100;

function parsePagination(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(searchParams.get("limit") || "20", 10))
  );
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export async function GET(request: NextRequest) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) {
      return badRequest(error);
    }

    const searchParams = request.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(searchParams);

    const entityIdParam = searchParams.get("entityId");
    if (entityIdParam && !UUID_RE.test(entityIdParam)) {
      return badRequest("entityId must be a valid UUID");
    }

    const metricTypeParam = searchParams.get("metricType");
    if (
      metricTypeParam !== null &&
      !isValidEnum(metricTypeParam, VALID_METRIC_TYPES)
    ) {
      return badRequest("metricType must be a valid enum value");
    }

    const where: Prisma.MetricSnapshotWhereInput = {
      projectId,
      ...(entityIdParam ? { entityId: entityIdParam } : {}),
      ...(metricTypeParam ? { metricType: metricTypeParam } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.metricSnapshot.findMany({
        where,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip,
        take: limit,
      }),
      prisma.metricSnapshot.count({ where }),
    ]);

    return listResponse(rows, { page, limit, total });
  } catch (err) {
    console.error("GET /api/metric-snapshots error:", err);
    return serverError();
  }
}
