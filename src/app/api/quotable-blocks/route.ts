/**
 * POST /api/quotable-blocks — Create a quotable block
 *
 * Phase 0-SEO manual endpoint for GEO citation asset creation.
 * - Creates canonical QuotableBlock (not DraftArtifact)
 * - Validates entityId belongs to same project
 * - Emits QUOTABLE_BLOCK_CREATED event
 *
 * Multi-project hardened:
 * - Resolves projectId from request
 * - All writes scoped by projectId
 * - Cross-project entityId returns 404
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  listResponse,
  createdResponse,
  badRequest,
  notFound,
  serverError,
  parsePagination,
} from "@/lib/api-response";
import { resolveProjectId } from "@/lib/project";
import { ClaimType, EventType, EntityType, ActorType } from "@prisma/client";
import type { Prisma } from "@prisma/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Explicit array of valid ClaimType values (type-safe)
const VALID_CLAIM_TYPES: readonly ClaimType[] = [
  ClaimType.statistic,
  ClaimType.comparison,
  ClaimType.definition,
  ClaimType.howto_step,
] as const;

function isValidClaimType(value: unknown): value is ClaimType {
  return typeof value === "string" && VALID_CLAIM_TYPES.includes(value as ClaimType);
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

// =============================================================================
// GET /api/quotable-blocks
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
    const where: Prisma.QuotableBlockWhereInput = { projectId };

    // entityId filter (UUID validation)
    const entityIdParam = searchParams.get("entityId");
    if (entityIdParam) {
      if (!UUID_RE.test(entityIdParam)) {
        return badRequest("entityId must be a valid UUID");
      }
      where.entityId = entityIdParam;
    }

    // claimType filter (enum validation)
    const claimTypeParam = searchParams.get("claimType");
    if (claimTypeParam) {
      if (!isValidClaimType(claimTypeParam)) {
        return badRequest(
          `claimType must be one of: ${VALID_CLAIM_TYPES.join(", ")}`
        );
      }
      where.claimType = claimTypeParam;
    }

    // topicTag filter (contains match)
    const topicTagParam = searchParams.get("topicTag");
    if (topicTagParam) {
      where.topicTag = { contains: topicTagParam, mode: "insensitive" };
    }

    // verifiedUntilBefore filter (strict ISO validation)
    const verifiedUntilBeforeParam = searchParams.get("verifiedUntilBefore");
    if (verifiedUntilBeforeParam) {
      if (!isValidIsoDate(verifiedUntilBeforeParam)) {
        return badRequest("verifiedUntilBefore must be a valid ISO date string (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)");
      }
      where.verifiedUntil = {
        ...((where.verifiedUntil as Prisma.DateTimeNullableFilter) || {}),
        lte: new Date(verifiedUntilBeforeParam),
      };
    }

    // verifiedUntilAfter filter (strict ISO validation)
    const verifiedUntilAfterParam = searchParams.get("verifiedUntilAfter");
    if (verifiedUntilAfterParam) {
      if (!isValidIsoDate(verifiedUntilAfterParam)) {
        return badRequest("verifiedUntilAfter must be a valid ISO date string (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)");
      }
      where.verifiedUntil = {
        ...((where.verifiedUntil as Prisma.DateTimeNullableFilter) || {}),
        gte: new Date(verifiedUntilAfterParam),
      };
    }

    const [rows, total] = await Promise.all([
      prisma.quotableBlock.findMany({
        where,
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
        skip,
        take: limit,
      }),
      prisma.quotableBlock.count({ where }),
    ]);

    return listResponse(rows, { page, limit, total });
  } catch (error) {
    console.error("GET /api/quotable-blocks error:", error);
    return serverError();
  }
}

// =============================================================================
// POST /api/quotable-blocks
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

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return badRequest("Request body must be an object");
    }

    const b = body as Record<string, unknown>;

    // Validate entityId (required)
    if (typeof b.entityId !== "string") {
      return badRequest("entityId is required and must be a string");
    }
    if (!UUID_RE.test(b.entityId)) {
      return badRequest("entityId must be a valid UUID");
    }
    const entityId = b.entityId;

    // Validate text (required, non-empty)
    if (typeof b.text !== "string" || b.text.trim().length === 0) {
      return badRequest("text is required and must be a non-empty string");
    }
    const text = b.text.trim();

    // Validate claimType (required, must match enum)
    if (!isValidClaimType(b.claimType)) {
      return badRequest(
        `claimType must be one of: ${VALID_CLAIM_TYPES.join(", ")}`
      );
    }
    const claimType = b.claimType;

    // Validate sourceCitation (optional, must be string if provided)
    let sourceCitation: string | null = null;
    if (b.sourceCitation !== undefined && b.sourceCitation !== null) {
      if (typeof b.sourceCitation !== "string") {
        return badRequest("sourceCitation must be a string");
      }
      sourceCitation = b.sourceCitation.trim() || null;
    }

    // Validate topicTag (optional, must be string if provided)
    let topicTag: string | null = null;
    if (b.topicTag !== undefined && b.topicTag !== null) {
      if (typeof b.topicTag !== "string") {
        return badRequest("topicTag must be a string");
      }
      topicTag = b.topicTag.trim() || null;
    }

    // Validate verifiedUntil (optional, must be valid ISO date if provided)
    let verifiedUntil: Date | null = null;
    if (b.verifiedUntil !== undefined && b.verifiedUntil !== null) {
      if (!isValidIsoDate(b.verifiedUntil)) {
        return badRequest("verifiedUntil must be a valid ISO date string");
      }
      verifiedUntil = new Date(b.verifiedUntil);
    }

    // Verify entity exists AND belongs to this project
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { id: true, projectId: true },
    });

    if (!entity) {
      return notFound("Entity not found");
    }

    if (entity.projectId !== projectId) {
      // Cross-project access: return 404 to avoid leaking existence
      return notFound("Entity not found");
    }

    // Transactional create + event log (atomic)
    const quotableBlock = await prisma.$transaction(async (tx) => {
      const qb = await tx.quotableBlock.create({
        data: {
          projectId,
          entityId,
          text,
          claimType,
          sourceCitation,
          topicTag,
          verifiedUntil,
        },
      });

      const details: Prisma.InputJsonObject = {
        entityId,
        claimType,
        textLength: text.length,
      };

      await tx.eventLog.create({
        data: {
          eventType: EventType.QUOTABLE_BLOCK_CREATED,
          entityType: EntityType.quotableBlock,
          entityId: qb.id,
          actor: ActorType.human,
          projectId,
          details,
        },
      });

      return qb;
    });

    return createdResponse({ ok: true, id: quotableBlock.id });
  } catch (error) {
    console.error("POST /api/quotable-blocks error:", error);
    return serverError();
  }
}
