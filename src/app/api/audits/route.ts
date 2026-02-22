/**
 * GET /api/audits — List BYDA-S S0 audit drafts (read-only surface)
 *
 * Phase 2 (S1): Read projection over DraftArtifact (byda_s_audit only).
 *
 * Hard constraints:
 * - No schema changes
 * - Project scoping via resolveProjectId()
 * - Deterministic ordering: createdAt desc, id desc
 * - TTL enforced at read-time by default (exclude expired)
 * - No mutation, no event logging
 *
 * Optional filters (explicit, validated):
 * - status=draft|archived (default: draft)
 * - includeExpired=true|false (default: false)
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  listResponse,
  badRequest,
  serverError,
} from "@/lib/api-response";
import { resolveProjectId } from "@/lib/project";
import {
  DraftArtifactKind,
  DraftArtifactStatus,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";

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

function parseBoolean(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

function parseStatus(value: string | null): DraftArtifactStatus | undefined {
  if (value === null) return undefined;
  if (value === "draft") return DraftArtifactStatus.draft;
  if (value === "archived") return DraftArtifactStatus.archived;
  return undefined;
}

export async function GET(request: NextRequest) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) {
      return badRequest(error);
    }

    const searchParams = request.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(searchParams);

    const statusParam = searchParams.get("status");
    const status = parseStatus(statusParam);
    if (statusParam !== null && !status) {
      return badRequest("status must be one of: draft, archived");
    }

    const includeExpiredParam = searchParams.get("includeExpired");
    const includeExpired = parseBoolean(includeExpiredParam);
    if (includeExpiredParam !== null && includeExpired === undefined) {
      return badRequest("includeExpired must be a boolean");
    }

    const now = new Date();

    const where: Prisma.DraftArtifactWhereInput = {
      projectId,
      kind: DraftArtifactKind.byda_s_audit,
      status: status ?? DraftArtifactStatus.draft,
      deletedAt: null,
      ...(includeExpired ? {} : { expiresAt: { gte: now } }),
    };

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
    console.error("GET /api/audits error:", err);
    return serverError();
  }
}