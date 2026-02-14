/**
 * POST /api/drafts/expire — Sweep expired drafts and emit DRAFT_EXPIRED events
 *
 * Phase 1 disciplined (Option A compatible):
 * - No schema changes
 * - No UI changes
 * - Drafts are non-canonical scaffolding
 *
 * Intended to be called by a scheduler (platform cron) or manually.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, badRequest, unauthorized, serverError } from "@/lib/api-response";

function parseLimit(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

export async function POST(request: NextRequest) {
  try {
    // Optional guardrail for cron usage. If unset, endpoint is open.
    const requiredToken = process.env.DRAFT_SWEEP_TOKEN;
    if (requiredToken) {
      const auth = request.headers.get("authorization") ?? "";
      const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
      if (token !== requiredToken) {
        return unauthorized("Invalid or missing token");
      }
    }

    // Parse limit query param
    const url = new URL(request.url);
    const qLimit = url.searchParams.get("limit");
    
    let limit = 200; // default
    if (qLimit !== null) {
      const parsedLimit = parseLimit(qLimit);
      if (parsedLimit === null) {
        return badRequest("limit must be an integer between 1 and 200");
      }
      if (parsedLimit < 1 || parsedLimit > 200) {
        return badRequest("limit must be an integer between 1 and 200");
      }
      limit = parsedLimit;
    }

    const now = new Date();

    // Atomic sweep + event emission using transaction
    const result = await prisma.$transaction(async (tx) => {
      // Only drafts tied to a SourceItem can be evented as required by docs.
      const expired = await tx.draftArtifact.findMany({
        where: {
          status: "draft",
          deletedAt: null,
          sourceItemId: { not: null },
          expiresAt: { lte: now },
        },
        select: {
          id: true,
          sourceItemId: true,
          projectId: true,
        },
        orderBy: {
          expiresAt: "asc",
        },
        take: limit,
      });

      if (expired.length === 0) {
        return { expiredCount: 0, draftIds: [], hasMore: false };
      }

      const draftIds = expired.map((d) => d.id);

      // Soft-delete + archive expired drafts
      await tx.draftArtifact.updateMany({
        where: { id: { in: draftIds } },
        data: {
          status: "archived",
          deletedAt: now,
        },
      });

      // Emit one DRAFT_EXPIRED per draft (per docs)
      await Promise.all(
        expired.map((d) =>
          tx.eventLog.create({
            data: {
              eventType: "DRAFT_EXPIRED",
              entityType: "sourceItem",
              entityId: d.sourceItemId!,
              actor: "system",
              projectId: d.projectId,
              details: {
                draftId: d.id,
              },
            },
          })
        )
      );

      return { expiredCount: draftIds.length, draftIds };
    });

    // Check if more expired drafts remain
    const remainingExpired = await prisma.draftArtifact.count({
      where: {
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
