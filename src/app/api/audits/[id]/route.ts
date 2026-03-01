/**
 * GET /api/audits/:id — Fetch single BYDA-S S0 audit draft (read-only surface)
 *
 * Phase 2 (S1): Read projection over DraftArtifact (byda_s_audit only).
 *
 * Hard constraints:
 * - No schema changes
 * - Project scoping via resolveProjectId()
 * - Kind-scoped to byda_s_audit
 * - No mutation, no event logging
 *
 * Status semantics:
 * - Returns the artifact regardless of status (draft or archived).
 * - TTL (expiresAt) is NOT enforced here: a promoted/archived artifact should
 *   remain readable for traceability. TTL enforcement is the responsibility of
 *   the promote endpoint (which guards against promoting expired drafts).
 * - deletedAt: null is still enforced (soft-deleted records are hidden).
 *
 * Optional query parameters (validated):
 * - includeExplain=true|false   (default: false)
 * - includePromotion=true|false (default: false)
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  successResponse,
  badRequest,
  notFound,
  serverError,
} from "@/lib/api-response";
import { resolveProjectId } from "@/lib/project";
import {
  DraftArtifactKind,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseStrictBoolean(
  value: string | null
): boolean | "invalid" | "absent" {
  if (value === null) return "absent";
  if (value === "true") return true;
  if (value === "false") return false;
  return "invalid";
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) {
      return badRequest(error);
    }

    const { id } = await context.params;

    if (!UUID_RE.test(id)) {
      return badRequest("id must be a valid UUID");
    }

    const searchParams = request.nextUrl.searchParams;

    // Validate includeExplain
    const includeExplainRaw = parseStrictBoolean(
      searchParams.get("includeExplain")
    );
    if (includeExplainRaw === "invalid") {
      return badRequest("includeExplain must be a boolean");
    }
    const includeExplain = includeExplainRaw === true;

    // Validate includePromotion
    const includePromotionRaw = parseStrictBoolean(
      searchParams.get("includePromotion")
    );
    if (includePromotionRaw === "invalid") {
      return badRequest("includePromotion must be a boolean");
    }
    const includePromotion = includePromotionRaw === true;

    // Project-scoped, kind-scoped, not soft-deleted.
    // Status is intentionally unrestricted: draft and archived records are both readable.
    // TTL (expiresAt) is not enforced here — see header comment.
    const where: Prisma.DraftArtifactWhereInput = {
      id,
      projectId,
      kind: DraftArtifactKind.byda_s_audit,
      deletedAt: null,
    };

    const row = await prisma.draftArtifact.findFirst({ where });

    if (!row) {
      // Non-disclosure preserved: missing or cross-project both return 404.
      return notFound("Audit not found");
    }

    // Build response. Parse content JSON once for optional projection fields.
    // If content is malformed, degrade gracefully: return null for optional fields
    // rather than 500, since the base record is valid.
    let parsedContent: Record<string, unknown> | null = null;
    try {
      const c = JSON.parse(row.content);
      if (typeof c === "object" && c !== null && !Array.isArray(c)) {
        parsedContent = c as Record<string, unknown>;
      }
    } catch {
      // content unparseable — optional projection fields will be null
    }

    const response: Record<string, unknown> = { ...row };

    if (includeExplain) {
      // explain: the layers/gaps detail from the stored audit content
      response.explain = parsedContent?.layers ?? null;
    }

    if (includePromotion) {
      // promotion: the scores that were (or would be) promoted to MetricSnapshots
      response.promotion = parsedContent?.scores ?? null;
    }

    return successResponse(response);
  } catch (err) {
    console.error("GET /api/audits/:id error:", err);
    return serverError();
  }
}
