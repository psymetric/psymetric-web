/**
 * GET /api/audits/:id — Fetch single BYDA-S S0 audit draft (read-only surface)
 *
 * Phase 2 (S1): Read projection over DraftArtifact (byda_s_audit only).
 *
 * Hard constraints:
 * - No schema changes
 * - Project scoping via resolveProjectId()
 * - TTL enforced at read-time (exclude expired)
 * - Kind-scoped to byda_s_audit
 * - No mutation, no event logging
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
  DraftArtifactStatus,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

    const now = new Date();

    const where: Prisma.DraftArtifactWhereInput = {
      id,
      projectId,
      kind: DraftArtifactKind.byda_s_audit,
      status: DraftArtifactStatus.draft,
      deletedAt: null,
      expiresAt: { gte: now },
    };

    const row = await prisma.draftArtifact.findFirst({ where });

    if (!row) {
      // Non-disclosure preserved
      return notFound("Audit not found");
    }

    return successResponse(row);
  } catch (err) {
    console.error("GET /api/audits/:id error:", err);
    return serverError();
  }
}
