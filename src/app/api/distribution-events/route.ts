/**
 * POST /api/distribution-events — Record distribution action
 * GET /api/distribution-events — List distribution events with filtering
 *
 * Phase 1 Distribution & Metrics - Minimal write endpoint
 * - Records manual distribution (human-posted content to X)
 * - No autonomous posting, no draft workflow
 * - Always creates as published status
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
  isValidUrl,
  VALID_PLATFORMS,
  VALID_ENTITY_STATUSES,
} from "@/lib/validation";
import type { Prisma } from "@prisma/client";

// =============================================================================
// GET /api/distribution-events
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(searchParams);

    const where: Prisma.DistributionEventWhereInput = {};

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

    // Status filter
    const status = searchParams.get("status");
    if (status) {
      if (!isValidEnum(status, VALID_ENTITY_STATUSES)) {
        return badRequest(
          "status must be one of: draft, publish_requested, published, archived"
        );
      }
      where.status = status;
    }

    // Primary entity filter
    const primaryEntityId = searchParams.get("primaryEntityId");
    if (primaryEntityId) {
      where.primaryEntityId = primaryEntityId;
    }

    // Search filter (externalUrl contains)
    const search = searchParams.get("search");
    if (search) {
      where.externalUrl = {
        contains: search,
        mode: "insensitive",
      };
    }

    // Date range filters (publishedAt is nullable)
    const publishedAtFilter: Prisma.DateTimeNullableFilter = {};

    const publishedAfter = searchParams.get("publishedAfter");
    if (publishedAfter) {
      const afterDate = new Date(publishedAfter);
      if (isNaN(afterDate.getTime())) {
        return badRequest("publishedAfter must be a valid ISO date string");
      }
      publishedAtFilter.gte = afterDate;
    }

    const publishedBefore = searchParams.get("publishedBefore");
    if (publishedBefore) {
      const beforeDate = new Date(publishedBefore);
      if (isNaN(beforeDate.getTime())) {
        return badRequest("publishedBefore must be a valid ISO date string");
      }
      publishedAtFilter.lte = beforeDate;
    }

    if (publishedAtFilter.gte || publishedAtFilter.lte) {
      where.publishedAt = publishedAtFilter;
    }

    const [distributionEvents, total] = await Promise.all([
      prisma.distributionEvent.findMany({
        where,
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.distributionEvent.count({ where }),
    ]);

    return listResponse(distributionEvents, { page, limit, total });
  } catch (error) {
    console.error("GET /api/distribution-events error:", error);
    return serverError();
  }
}

// =============================================================================
// POST /api/distribution-events
// =============================================================================

export async function POST(request: NextRequest) {
  try {
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
    const { platform, primaryEntityId, externalUrl, publishedAt } = b;

    // Validate platform
    if (!isValidEnum(platform, VALID_PLATFORMS)) {
      return badRequest(
        "platform must be one of: website, x, youtube, github, other"
      );
    }

    // Validate primaryEntityId
    if (!primaryEntityId || typeof primaryEntityId !== "string") {
      return badRequest("primaryEntityId is required");
    }

    // Validate externalUrl
    if (!isValidUrl(externalUrl)) {
      return badRequest("externalUrl must be a valid URL");
    }

    // Parse publishedAt if provided
    let publishedAtDate = new Date();
    if (publishedAt) {
      if (typeof publishedAt !== "string") {
        return badRequest("publishedAt must be an ISO date string");
      }
      publishedAtDate = new Date(publishedAt);
      if (isNaN(publishedAtDate.getTime())) {
        return badRequest("publishedAt must be a valid ISO date string");
      }
    }

    // Verify primary entity exists
    const entity = await prisma.entity.findUnique({
      where: { id: primaryEntityId },
      select: { id: true, entityType: true, projectId: true },
    });

    if (!entity) {
      return notFound("Primary entity not found");
    }

    // Transactional create + event log (atomic)
    const distributionEvent = await prisma.$transaction(async (tx) => {
      const de = await tx.distributionEvent.create({
        data: {
          platform,
          externalUrl,
          status: "published",
          publishedAt: publishedAtDate,
          primaryEntityType: entity.entityType,
          primaryEntityId,
          projectId: entity.projectId,
        },
      });

      await tx.eventLog.create({
        data: {
          eventType: "DISTRIBUTION_PUBLISHED",
          entityType: "distributionEvent",
          entityId: de.id,
          actor: "human",
          projectId: entity.projectId,
          details: {
            platform,
            primaryEntityId,
            externalUrl,
          },
        },
      });

      return de;
    });

    return createdResponse({
      id: distributionEvent.id,
      platform: distributionEvent.platform,
      externalUrl: distributionEvent.externalUrl,
      status: distributionEvent.status,
      publishedAt: distributionEvent.publishedAt?.toISOString(),
      archivedAt: distributionEvent.archivedAt?.toISOString(),
      primaryEntityType: distributionEvent.primaryEntityType,
      primaryEntityId: distributionEvent.primaryEntityId,
      createdAt: distributionEvent.createdAt.toISOString(),
      updatedAt: distributionEvent.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("POST /api/distribution-events error:", error);
    return serverError();
  }
}
