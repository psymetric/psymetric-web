/**
 * POST /api/drafts/[id]/archive — Archive a draft
 *
 * Per docs/ROADMAP.md Phase 1 Draft System requirements
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  successResponse,
  notFound,
  badRequest,
  serverError,
} from "@/lib/api-response";
import { logEvent } from "@/lib/events";

// =============================================================================
// POST /api/drafts/[id]/archive
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // --- Validate id param ---
    if (!id || typeof id !== "string") {
      return badRequest("Invalid id parameter");
    }

    // --- Load DraftArtifact ---
    const draft = await prisma.draftArtifact.findUnique({
      where: { id },
    });

    if (!draft) {
      return notFound("Draft not found");
    }

    // --- Ensure draft is associated with a source item ---
    if (!draft.sourceItemId) {
      return badRequest("Draft is not associated with a source item");
    }

    // --- Update draft: archive and soft delete ---
    const now = new Date();
    const updatedDraft = await prisma.draftArtifact.update({
      where: { id },
      data: {
        status: "archived",
        deletedAt: now,
      },
    });

    // --- Log ENTITY_UPDATED event ---
    await logEvent({
      eventType: "ENTITY_UPDATED",
      entityType: "sourceItem",
      entityId: draft.sourceItemId,
      actor: "system",
      details: {
        draftId: draft.id,
        action: "archived",
      },
    });

    return successResponse({
      id: updatedDraft.id,
      status: updatedDraft.status,
    });
  } catch (error) {
    console.error("POST /api/drafts/[id]/archive error:", error);
    return serverError();
  }
}
