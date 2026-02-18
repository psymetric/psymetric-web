/**
 * POST /api/drafts/[id]/archive — Archive a draft
 *
 * Per docs/ROADMAP.md Phase 1 Draft System requirements
 *
 * Multi-project hardened:
 * - Resolves projectId from request
 * - Verifies DraftArtifact belongs to project
 * - Draft update + event log are atomic inside prisma.$transaction()
 * - Removes logEvent helper usage
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  successResponse,
  notFound,
  badRequest,
  serverError,
} from "@/lib/api-response";
import { resolveProjectId } from "@/lib/project";

// UUID validation regex
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// =============================================================================
// POST /api/drafts/[id]/archive
// =============================================================================

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) {
      return badRequest(error);
    }

    const { id } = await context.params;

    // --- Validate id param ---
    if (!id || typeof id !== "string" || !UUID_RE.test(id)) {
      return badRequest("id must be a valid UUID");
    }

    // --- Load DraftArtifact ---
    const draft = await prisma.draftArtifact.findUnique({
      where: { id },
      select: { id: true, status: true, sourceItemId: true, projectId: true },
    });

    if (!draft || draft.projectId !== projectId) {
      return notFound("Draft not found");
    }

    // --- Ensure draft is associated with a source item ---
    if (!draft.sourceItemId) {
      return badRequest("Draft is not associated with a source item");
    }

    const now = new Date();

    // --- Update draft + log event atomically ---
    const updatedDraft = await prisma.$transaction(async (tx) => {
      const updated = await tx.draftArtifact.update({
        where: { id },
        data: {
          status: "archived",
          deletedAt: now,
        },
      });

      await tx.eventLog.create({
        data: {
          // Preserve existing event semantics used by the Phase 1 draft system.
          eventType: "ENTITY_UPDATED",
          entityType: "sourceItem",
          entityId: draft.sourceItemId!,
          actor: "system",
          projectId,
          details: {
            draftId: draft.id,
            action: "archived",
          },
        },
      });

      return updated;
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
