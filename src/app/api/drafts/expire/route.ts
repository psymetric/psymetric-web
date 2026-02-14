/**
 * POST /api/drafts/expire — Sweep expired drafts and emit DRAFT_EXPIRED events
 *
 * Multi-project hardened:
 * - Resolves projectId from request
 * - Sweeps only drafts belonging to that project
 * - All state mutations + events inside $transaction()
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  successResponse,
  badRequest,
  unauthorized,
  serverError,
} from "@/lib/api-response";
import { resolveProjectId } from "@/lib/project";

function parseLimit(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

export async function POST(request: NextRequest) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) {
      return badRequest(error);
    }

    // Optional guardrail for cron usage
    const requiredToken = process.env.DRAFT_SWEEP_TOKEN;
    if (requiredToken) {
      const auth = request.headers.get("authorization") ?? "";
      const token = auth.startsWith("Bearer ")
        ? auth.slice("Bearer ".length)
        : "";
      if (token !== requiredToken) {
        return unauthorized("Invalid or missing token");
      }
    }

    const url = new URL(request.url);
    const qLimit = url.searchParams.get("limit");

    let limit = 200;
    if (qLimit !== null) {
      const parsedLimit = parseLimit(qLimit);
      if (parsedLimit === null || parsedLimit < 1 || parsedLimit > 200) {
        return badRequest("limit must be an integer between 1 and 200");
      }
      limit = parsedLimit;
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const expired = await tx.draftArtifact.findMany({
        where: {
          projectId,
          status: "draft",
          deletedAt: null,
          sourceItemId: { not: null },
          expiresAt: { lte: now },
        },
        select: {
          id: true,
          sourceItemId: true,
        },
        orderBy: {
          expiresAt: "asc",
        },
        take: limit,
      });

      if (expired.length === 0) {
        return { expiredCount: 0, draftIds: [] };
      }

      const draftIds = expired.map((d) => d.id);

      await tx.draftArtifact.updateMany({
        where: {
          projectId,
          id: { in: draftIds },
        },
        data: {
          status: "archived",
          deletedAt: now,
        },
      });

      await Promise.all(
        expired.map((d) =>
          tx.eventLog.create({
            data: {
              eventType: "DRAFT_EXPIRED",
              entityType: "sourceItem",
              entityId: d.sourceItemId!,
              actor: "system",
              projectId,
              details: {
                draftId: d.id,
              },
            },
          })
        )
      );

      return { expiredCount: draftIds.length, draftIds };
    });

    const remainingExpired = await prisma.draftArtifact.count({
      where: {
        projectId,
        status: "draft",
        deletedAt: null,
        sourceItemId: { not: null },
        expiresAt: { lte: now },
      },
    });

    return successResponse({
      expiredCount: result.expiredCount,
      draftIds: result.draftIds,
      hasMore: remainingExpired > 0,
    });
  } catch (error) {
    console.error("POST /api/drafts/expire error:", error);
    return serverError();
  }
}
