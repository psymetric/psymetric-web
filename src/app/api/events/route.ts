/**
 * GET /api/events — List EventLog entries with filtering
 *
 * Phase 1 read-only EventLog timeline endpoint
 * - Provides deterministic filtering and pagination
 * - No writes, no EventLog emissions, no aggregation
 * - Mirrors existing GET list patterns
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  listResponse,
  badRequest,
  serverError,
  parsePagination,
} from "@/lib/api-response";
import { EventType, EntityType, ActorType } from "@prisma/client";
import type { Prisma } from "@prisma/client";

// UUID validation regex
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(searchParams);

    const where: Prisma.EventLogWhereInput = {};

    // EventType filter
    const eventType = searchParams.get("eventType");
    if (eventType) {
      if (!Object.values(EventType).includes(eventType as EventType)) {
        return badRequest(
          `eventType must be one of: ${Object.values(EventType).join(", ")}`
        );
      }
      where.eventType = eventType as EventType;
    }

    // EntityType filter
    const entityType = searchParams.get("entityType");
    if (entityType) {
      if (!Object.values(EntityType).includes(entityType as EntityType)) {
        return badRequest(
          `entityType must be one of: ${Object.values(EntityType).join(", ")}`
        );
      }
      where.entityType = entityType as EntityType;
    }

    // EntityId filter (validate UUID format)
    const entityId = searchParams.get("entityId");
    if (entityId) {
      if (!UUID_RE.test(entityId)) {
        return badRequest("entityId must be a valid UUID");
      }
      where.entityId = entityId;
    }

    // Actor filter
    const actor = searchParams.get("actor");
    if (actor) {
      if (!Object.values(ActorType).includes(actor as ActorType)) {
        return badRequest(
          `actor must be one of: ${Object.values(ActorType).join(", ")}`
        );
      }
      where.actor = actor as ActorType;
    }

    // Date range filters
    const timestampFilter: Prisma.DateTimeFilter = {};

    const after = searchParams.get("after");
    if (after) {
      const afterDate = new Date(after);
      if (isNaN(afterDate.getTime())) {
        return badRequest("after must be a valid ISO date string");
      }
      timestampFilter.gte = afterDate;
    }

    const before = searchParams.get("before");
    if (before) {
      const beforeDate = new Date(before);
      if (isNaN(beforeDate.getTime())) {
        return badRequest("before must be a valid ISO date string");
      }
      timestampFilter.lte = beforeDate;
    }

    if (timestampFilter.gte || timestampFilter.lte) {
      where.timestamp = timestampFilter;
    }

    const [events, total] = await Promise.all([
      prisma.eventLog.findMany({
        where,
        orderBy: [
          { timestamp: "desc" },
          { id: "desc" },
        ],
        skip,
        take: limit,
      }),
      prisma.eventLog.count({ where }),
    ]);

    return listResponse(events, { page, limit, total });
  } catch (error) {
    console.error("GET /api/events error:", error);
    return serverError();
  }
}
