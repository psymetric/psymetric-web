/**
 * POST /api/seo/search-performance/ingest — Bulk ingest search performance data
 *
 * Phase 0-SEO manual endpoint for GSC opportunity query ingestion.
 * - Accepts bulk rows (manual upload/paste)
 * - Upserts by composite unique: (projectId, query, pageUrl, dateStart, dateEnd)
 * - Validates entityId belongs to same project if provided
 * - Single summary EventLog entry per batch
 *
 * Multi-project hardened:
 * - Resolves projectId from request
 * - All writes scoped by projectId
 * - Cross-project entityId returns 404
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, badRequest, notFound, serverError } from "@/lib/api-response";
import { resolveProjectId } from "@/lib/project";
import { EventType, EntityType, ActorType } from "@prisma/client";
import type { Prisma } from "@prisma/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface SearchPerformanceRow {
  query: string;
  pageUrl: string;
  impressions: number;
  clicks: number;
  ctr: number;
  avgPosition: number;
  dateStart: string;
  dateEnd: string;
  entityId?: string | null;
}

function isValidUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.trim().length === 0) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// Strict ISO 8601 date validation (deterministic across environments)
// Accepts ONLY:
//   - Date-only: YYYY-MM-DD
//   - UTC timestamp: YYYY-MM-DDTHH:mm:ssZ or YYYY-MM-DDTHH:mm:ss.sssZ
// Rejects: locale formats, timezone offsets other than Z, missing Z on timestamps
const ISO_DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;

  const isDateOnly = ISO_DATE_ONLY_RE.test(value);
  const isTimestamp = ISO_TIMESTAMP_RE.test(value);

  if (!isDateOnly && !isTimestamp) return false;

  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return false;

  // Round-trip check for date-only to ensure deterministic parsing
  if (isDateOnly) {
    return parsed.toISOString().slice(0, 10) === value;
  }

  // Timestamp with Z: parsing succeeded and format matched
  return true;
}

function validateRow(
  row: unknown,
  index: number
): { valid: true; data: SearchPerformanceRow } | { valid: false; error: string } {
  if (typeof row !== "object" || row === null) {
    return { valid: false, error: `Row ${index}: must be an object` };
  }

  const r = row as Record<string, unknown>;

  // query: non-empty string
  if (typeof r.query !== "string" || r.query.trim().length === 0) {
    return { valid: false, error: `Row ${index}: query must be a non-empty string` };
  }

  // pageUrl: valid URL
  if (!isValidUrl(r.pageUrl)) {
    return { valid: false, error: `Row ${index}: pageUrl must be a valid URL` };
  }

  // impressions: non-negative integer
  if (
    typeof r.impressions !== "number" ||
    !Number.isFinite(r.impressions) ||
    !Number.isInteger(r.impressions) ||
    r.impressions < 0
  ) {
    return { valid: false, error: `Row ${index}: impressions must be a non-negative integer` };
  }

  // clicks: non-negative integer
  if (
    typeof r.clicks !== "number" ||
    !Number.isFinite(r.clicks) ||
    !Number.isInteger(r.clicks) ||
    r.clicks < 0
  ) {
    return { valid: false, error: `Row ${index}: clicks must be a non-negative integer` };
  }

  // clicks <= impressions
  if (r.clicks > r.impressions) {
    return { valid: false, error: `Row ${index}: clicks cannot exceed impressions` };
  }

  // ctr: number between 0 and 1
  if (
    typeof r.ctr !== "number" ||
    !Number.isFinite(r.ctr) ||
    r.ctr < 0 ||
    r.ctr > 1
  ) {
    return { valid: false, error: `Row ${index}: ctr must be a number between 0 and 1` };
  }

  // avgPosition: positive number
  if (
    typeof r.avgPosition !== "number" ||
    !Number.isFinite(r.avgPosition) ||
    r.avgPosition <= 0
  ) {
    return { valid: false, error: `Row ${index}: avgPosition must be a positive number` };
  }

  // dateStart: valid ISO date
  if (!isValidIsoDate(r.dateStart)) {
    return { valid: false, error: `Row ${index}: dateStart must be a valid ISO date string` };
  }

  // dateEnd: valid ISO date
  if (!isValidIsoDate(r.dateEnd)) {
    return { valid: false, error: `Row ${index}: dateEnd must be a valid ISO date string` };
  }

  // dateStart <= dateEnd
  const startDate = new Date(r.dateStart);
  const endDate = new Date(r.dateEnd);
  if (startDate > endDate) {
    return { valid: false, error: `Row ${index}: dateStart must be <= dateEnd` };
  }

  // entityId: optional, must be valid UUID if provided
  let entityId: string | null = null;
  if (r.entityId !== undefined && r.entityId !== null) {
    if (typeof r.entityId !== "string" || !UUID_RE.test(r.entityId)) {
      return { valid: false, error: `Row ${index}: entityId must be a valid UUID` };
    }
    entityId = r.entityId;
  }

  return {
    valid: true,
    data: {
      query: r.query.trim(),
      pageUrl: r.pageUrl as string,
      impressions: r.impressions,
      clicks: r.clicks,
      ctr: r.ctr,
      avgPosition: r.avgPosition,
      dateStart: r.dateStart as string,
      dateEnd: r.dateEnd as string,
      entityId,
    },
  };
}

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

    // Body must be object with rows array
    if (typeof body !== "object" || body === null) {
      return badRequest("Request body must be an object");
    }

    const b = body as Record<string, unknown>;
    const rows = b.rows;

    if (!Array.isArray(rows)) {
      return badRequest("rows must be an array");
    }

    if (rows.length === 0) {
      return badRequest("rows array cannot be empty");
    }

    // Validate all rows first
    const validatedRows: SearchPerformanceRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const result = validateRow(rows[i], i);
      if (!result.valid) {
        return badRequest(result.error);
      }
      validatedRows.push(result.data);
    }

    // Collect unique entityIds for batch verification
    const entityIdsToVerify = new Set<string>();
    for (const row of validatedRows) {
      if (row.entityId) {
        entityIdsToVerify.add(row.entityId);
      }
    }

    // Verify all referenced entities exist and belong to this project
    if (entityIdsToVerify.size > 0) {
      const entities = await prisma.entity.findMany({
        where: {
          id: { in: Array.from(entityIdsToVerify) },
        },
        select: { id: true, projectId: true },
      });

      const entityMap = new Map(entities.map((e) => [e.id, e.projectId]));

      for (const entityId of entityIdsToVerify) {
        const entityProjectId = entityMap.get(entityId);
        if (!entityProjectId) {
          return notFound(`Entity not found: ${entityId}`);
        }
        if (entityProjectId !== projectId) {
          // Cross-project access: return 404 to avoid leaking existence
          return notFound(`Entity not found: ${entityId}`);
        }
      }
    }

    // Deterministic processing order: sort by (query, pageUrl, dateStart, dateEnd)
    const sortedRows = [...validatedRows].sort((a, b) => {
      const cmp1 = a.query.localeCompare(b.query);
      if (cmp1 !== 0) return cmp1;
      const cmp2 = a.pageUrl.localeCompare(b.pageUrl);
      if (cmp2 !== 0) return cmp2;
      const cmp3 = a.dateStart.localeCompare(b.dateStart);
      if (cmp3 !== 0) return cmp3;
      return a.dateEnd.localeCompare(b.dateEnd);
    });

    // Track date window for summary
    let minDateStart: Date | null = null;
    let maxDateEnd: Date | null = null;

    // Transactional upsert + event log (atomic)
    const rowCount = await prisma.$transaction(async (tx) => {
      let count = 0;

      for (const row of sortedRows) {
        const dateStart = new Date(row.dateStart);
        const dateEnd = new Date(row.dateEnd);

        // Track date window
        if (!minDateStart || dateStart < minDateStart) {
          minDateStart = dateStart;
        }
        if (!maxDateEnd || dateEnd > maxDateEnd) {
          maxDateEnd = dateEnd;
        }

        await tx.searchPerformance.upsert({
          where: {
            projectId_query_pageUrl_dateStart_dateEnd: {
              projectId,
              query: row.query,
              pageUrl: row.pageUrl,
              dateStart,
              dateEnd,
            },
          },
          create: {
            projectId,
            entityId: row.entityId ?? null,
            pageUrl: row.pageUrl,
            query: row.query,
            impressions: row.impressions,
            clicks: row.clicks,
            ctr: row.ctr,
            avgPosition: row.avgPosition,
            dateStart,
            dateEnd,
          },
          update: {
            entityId: row.entityId ?? null,
            impressions: row.impressions,
            clicks: row.clicks,
            ctr: row.ctr,
            avgPosition: row.avgPosition,
          },
        });

        count++;
      }

      // Emit summary EventLog entry
      const details: Prisma.InputJsonObject = {
        model: "searchPerformance",
        rowCount: count,
        dateWindowStart: minDateStart?.toISOString() ?? null,
        dateWindowEnd: maxDateEnd?.toISOString() ?? null,
      };

      await tx.eventLog.create({
        data: {
          eventType: EventType.ENTITY_UPDATED,
          entityType: EntityType.project,
          entityId: projectId,
          actor: ActorType.human,
          projectId,
          details,
        },
      });

      return count;
    });

    return successResponse({ ok: true, rowCount });
  } catch (error) {
    console.error("POST /api/seo/search-performance/ingest error:", error);
    return serverError();
  }
}
