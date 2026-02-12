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
import { successResponse, badRequest, serverError } from "@/lib/api-response";
import { logEvent } from "@/lib/events";

export async function POST(request: NextRequest) {
  try {
    // Optional guardrail for cron usage. If unset, endpoint is open.
    const requiredToken = process.env.DRAFT_SWEEP_TOKEN;
    if (requiredToken) {
      const auth = request.headers.get("authorization") ?? "";
      const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
      if (token !== requiredToken) {
        return badRequest("Unauthorized");
      }
    }

    const now = new Date();

    // Only drafts tied to a SourceItem can be evented as required by docs.
    const expired = await prisma.draftArtifact.findMany({
      where: {
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
      take: 500,
    });

    if (expired.length === 0) {
      return successResponse({ expiredCount: 0 });
    }

    const draftIds = expired.map((d) => d.id);

    // Soft-delete + archive expired drafts.
    await prisma.draftArtifact.updateMany({
      where: { id: { in: draftIds } },
      data: {
        status: "archived",
        deletedAt: now,
      },
    });

    // Emit one DRAFT_EXPIRED per draft (per docs).
    await Promise.all(
      expired.map((d) =>
        logEvent({
          eventType: "DRAFT_EXPIRED",
          entityType: "sourceItem",
          entityId: d.sourceItemId!,
          actor: "system",
          details: {
            draftId: d.id,
          },
        })
      )
    );

    return successResponse({
      expiredCount: draftIds.length,
      draftIds,
    });
  } catch (error) {
    console.error("POST /api/drafts/expire error:", error);
    return serverError();
  }
}
