/**
 * POST /api/metric-snapshots — Record metric snapshot
 * GET /api/metric-snapshots — List metric snapshots with filtering
 *
 * Phase 1 Distribution & Metrics - Minimal write endpoint
 * - Records time-series metric snapshots
 * - No analytics, no conclusions, just data storage
 * - Deterministic validation only
 *
 * Multi-project hardened:
 * - Resolves projectId from request
 * - Scopes GET reads and counts by projectId
 * - POST verifies entity belongs to projectId; writes are project-scoped
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createdResponse,
  listResponse,
  badRequest,
  notFound,
  serverError,
  parsePagination,
} from "@/lib/api-response";
import {
  isValidEnum,
  VALID_PLATFORMS,
  VALID_METRIC_TYPES,
} from "@/lib/validation";
import { resolveProjectId } from "@/lib/project";
import type { Prisma } from "@prisma/client";

// UUID validation regex
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// =============================================================================
// GET /api/metric-snapshots
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) {
      return badRequest(error);
    }

    const searchParams = request.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(searchParams);

    // Always project-scoped
    const where: Prisma.MetricSnapshotWhereInput = { projectId };

    // Platform filter
    const platform = searchParams.get("platform");
    if (platform) {
      if (!isValidEnum(platform, VALID_PLATFORMS)) {
        return badRequest(
          "platform must be one of: website, x, youtube, github, other"
        );
      }
      where.platform = platform;
    }

    // MetricType filter
    const metricType = searchParams.get("metricType");
    if (metricType) {
      if (!isValidEnum(metricType, VALID_METRIC_TYPES)) {
        return badRequest(
          "metricType must be one of: x_impressions, x_likes, x_reposts, x_replies, x_bookmarks"
        );
      }
      where.metricType = metricType;
    }

    // Entity filter (with UUID validation)
    const entityId = searchParams.get("entityId");
    if (entityId) {
      if (!UUID_RE.test(entityId)) {
        return badRequest("entityId must be a valid UUID");
      }
      where.entityId = entityId;
    }

    // Date range filters (capturedAt is non-null)
    const capturedAtFilter: Prisma.DateTimeFilter = {};

    const capturedAfter = searchParams.get("capturedAfter");
    if (capturedAfter) {
      const afterDate = new Date(capturedAfter);
      if (isNaN(afterDate.getTime())) {
        return badRequest("capturedAfter must be a valid ISO date string");
      }
      capturedAtFilter.gte = afterDate;
    }

    const capturedBefore = searchParams.get("capturedBefore");
    if (capturedBefore) {
      const beforeDate = new Date(capturedBefore);
      if (isNaN(beforeDate.getTime())) {
        return badRequest("capturedBefore must be a valid ISO date string");
      }
      capturedAtFilter.lte = beforeDate;
    }

    if (capturedAtFilter.gte || capturedAtFilter.lte) {
      where.capturedAt = capturedAtFilter;
    }

    const [metricSnapshots, total] = await Promise.all([
      prisma.metricSnapshot.findMany({
        where,
        orderBy: [{ capturedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      }),
      prisma.metricSnapshot.count({ where }),
    ]);

    return listResponse(metricSnapshots, { page, limit, total });
  } catch (error) {
    console.error("GET /api/metric-snapshots error:", error);
    return serverError();
  }
}

// =============================================================================
// POST /api/metric-snapshots
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) {
      return badRequest(error);
    }

    // Parse request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    if (typeof body !== "object" || body === null) {
      return badRequest("Invalid JSON body");
    }

    const b = body as Record<string, unknown>;
    const { metricType, value, platform, entityId, capturedAt, notes } = b;

    // Validate metricType
    if (!isValidEnum(metricType, VALID_METRIC_TYPES)) {
      return badRequest(
        "metricType must be one of: x_impressions, x_likes, x_reposts, x_replies, x_bookmarks"
      );
    }

    // Validate value
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      return badRequest("value must be an integer >= 0");
    }

    // Validate platform
    if (!isValidEnum(platform, VALID_PLATFORMS)) {
      return badRequest(
        "platform must be one of: website, x, youtube, github, other"
      );
    }

    // Validate entityId
    if (!entityId || typeof entityId !== "string") {
      return badRequest("entityId is required");
    }
    if (!UUID_RE.test(entityId)) {
      return badRequest("entityId must be a valid UUID");
    }

    // Parse capturedAt if provided
    let capturedAtDate = new Date();
    if (capturedAt) {
      if (typeof capturedAt !== "string") {
        return badRequest("capturedAt must be an ISO date string");
      }
      capturedAtDate = new Date(capturedAt);
      if (isNaN(capturedAtDate.getTime())) {
        return badRequest("capturedAt must be a valid ISO date string");
      }
    }

    // Validate notes if provided
    if (notes !== undefined && notes !== null && typeof notes !== "string") {
      return badRequest("notes must be a string");
    }

    // Verify entity exists AND belongs to this project
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { id: true, entityType: true, projectId: true },
    });

    if (!entity || entity.projectId !== projectId) {
      return notFound("Entity not found");
    }

    // Transactional create + event log (atomic)
    const metricSnapshot = await prisma.$transaction(async (tx) => {
      const ms = await tx.metricSnapshot.create({
        data: {
          metricType,
          value,
          platform,
          capturedAt: capturedAtDate,
          entityType: entity.entityType,
          entityId,
          notes: typeof notes === "string" ? notes : null,
          projectId,
        },
      });

      await tx.eventLog.create({
        data: {
          eventType: "METRIC_SNAPSHOT_RECORDED",
          entityType: "metricSnapshot",
          entityId: ms.id,
          actor: "human",
          projectId,
          details: {
            metricType,
            value,
            platform,
            entityId,
          },
        },
      });

      return ms;
    });

    return createdResponse({
      id: metricSnapshot.id,
      metricType: metricSnapshot.metricType,
      value: metricSnapshot.value,
      platform: metricSnapshot.platform,
      capturedAt: metricSnapshot.capturedAt.toISOString(),
      entityType: metricSnapshot.entityType,
      entityId: metricSnapshot.entityId,
      notes: metricSnapshot.notes,
      createdAt: metricSnapshot.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("POST /api/metric-snapshots error:", error);
    return serverError();
  }
}
