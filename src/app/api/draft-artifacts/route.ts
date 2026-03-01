/**
 * POST /api/draft-artifacts — Create BYDA-S S0 audit draft
 * GET /api/draft-artifacts — List BYDA-S S0 audit drafts
 *
 * Phase 2 (S0): Minimal plumbing for storing and reviewing deterministic S0 audits.
 *
 * Hard constraints:
 * - No schema changes, no new models
 * - Project scoping via resolveProjectId() only
 * - Deterministic ordering: createdAt desc, id desc
 * - Strict validation, no unsafe casting
 * - Transaction + event logging (atomic writes)
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  listResponse,
  createdResponse,
  badRequest,
  notFound,
  serverError,
} from "@/lib/api-response";
import { resolveProjectId } from "@/lib/project";
import {
  DraftArtifactKind,
  DraftArtifactStatus,
  EventType,
  EntityType,
  ActorType,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { CreateDraftArtifactSchema } from "@/lib/schemas/draft-artifact";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

// Strict S0 schema version
const BYDA_S0_SCHEMA_VERSION = "byda.s0.v1";

// Only byda_s_audit kind allowed
const ALLOWED_KIND = DraftArtifactKind.byda_s_audit;

// Status is server-controlled (always draft on create)
const DRAFT_STATUS = DraftArtifactStatus.draft;

// createdBy is server-controlled (system for automated audits)
const CREATED_BY = ActorType.system;

// Expiration: 30 days from now
const EXPIRATION_DAYS = 30;

// GET pagination bounds for this endpoint (Phase 2 scope)
const MAX_LIMIT = 50;

function parsePagination(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(searchParams.get("limit") || "20", 10))
  );
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

/**
 * Validate ISO timestamp (strict UTC with Z)
 */
function isValidIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!ISO_TIMESTAMP_RE.test(value)) return false;
  const parsed = new Date(value);
  return !isNaN(parsed.getTime());
}

/**
 * Generate SHA-256 content hash
 */
async function generateContentHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}


// =============================================================================
// GET /api/draft-artifacts
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) {
      return badRequest(error);
    }

    const searchParams = request.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(searchParams);

    // Read-time TTL enforcement:
    // - Default listing returns *non-expired* drafts only
    // - status=draft also excludes expired drafts
    // - status=archived returns archived artifacts regardless of expiresAt
    const now = new Date();

    // Always project-scoped AND kind-scoped (Phase 2)
    const where: Prisma.DraftArtifactWhereInput = {
      projectId,
      kind: ALLOWED_KIND,
      deletedAt: null,
    };

    // kind filter (if provided, must equal byda_s_audit)
    const kindParam = searchParams.get("kind");
    if (kindParam && kindParam !== ALLOWED_KIND) {
      return badRequest(`kind must be "${ALLOWED_KIND}"`);
    }

    // entityId filter (UUID validation)
    const entityIdParam = searchParams.get("entityId");
    if (entityIdParam) {
      if (!UUID_RE.test(entityIdParam)) {
        return badRequest("entityId must be a valid UUID");
      }
      where.entityId = entityIdParam;
    }

    // status filter (enum validation)
    const statusParam = searchParams.get("status");
    if (statusParam) {
      if (
        statusParam !== DraftArtifactStatus.draft &&
        statusParam !== DraftArtifactStatus.archived
      ) {
        return badRequest("status must be 'draft' or 'archived'");
      }
      where.status = statusParam as DraftArtifactStatus;

      // TTL enforcement for explicit status=draft
      if (statusParam === DraftArtifactStatus.draft) {
        where.expiresAt = { gte: now };
      }
    } else {
      // Default: drafts only, excluding expired
      where.status = DraftArtifactStatus.draft;
      where.expiresAt = { gte: now };
    }

    const [rows, total] = await Promise.all([
      prisma.draftArtifact.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      }),
      prisma.draftArtifact.count({ where }),
    ]);

    return listResponse(rows, { page, limit, total });
  } catch (err) {
    console.error("GET /api/draft-artifacts error:", err);
    return serverError();
  }
}

// =============================================================================
// POST /api/draft-artifacts
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

    const parsed = CreateDraftArtifactSchema.safeParse(body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      return badRequest("Validation failed", [
        ...flat.formErrors.map((msg) => ({
          code: "VALIDATION_ERROR" as const,
          message: msg,
        })),
        ...Object.entries(flat.fieldErrors).flatMap(([field, messages]) =>
          (messages ?? []).map((msg) => ({
            code: "VALIDATION_ERROR" as const,
            field,
            message: msg,
          }))
        ),
      ]);
    }

    const data = parsed.data;
    const entityId = data.entityId;
    const parsedContent = data.content;

    // Cross-check: body.entityId must match content.entityId
    if (entityId !== parsedContent.entityId) {
      return badRequest("body.entityId must match content.entityId");
    }

    // Verify entity exists AND belongs to this project
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { id: true, projectId: true },
    });

    if (!entity || entity.projectId !== projectId) {
      // Cross-project non-disclosure: return 404
      return notFound("Entity not found");
    }

    // Serialize content to JSON string for storage
    const contentString = JSON.stringify(parsedContent);

    // Compute content hash (deterministic)
    const contentHash = await generateContentHash(contentString);

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + EXPIRATION_DAYS);

    // Transactional create + event log (atomic)
    const draft = await prisma.$transaction(async (tx) => {
      const artifact = await tx.draftArtifact.create({
        data: {
          kind: ALLOWED_KIND,
          status: DRAFT_STATUS,
          content: contentString,
          entityId,
          createdBy: CREATED_BY,
          schemaVersion: BYDA_S0_SCHEMA_VERSION,
          source: "byda_s",
          contentHash,
          expiresAt,
          projectId,
        },
      });

      const eventDetails: Prisma.InputJsonObject = {
        kind: ALLOWED_KIND,
        entityId,
        schemaVersion: BYDA_S0_SCHEMA_VERSION,
        scores: parsedContent.scores,
      };

      await tx.eventLog.create({
        data: {
          eventType: EventType.DRAFT_CREATED,
          entityType: EntityType.draftArtifact,
          entityId: artifact.id,
          actor: CREATED_BY,
          projectId,
          details: eventDetails,
        },
      });

      return artifact;
    });

    return createdResponse(draft);
  } catch (err) {
    console.error("POST /api/draft-artifacts error:", err);
    return serverError();
  }
}
