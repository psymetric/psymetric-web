/**
 * PUT /api/source-items/{id}/status
 * Per docs/operations-planning-api/01-API-ENDPOINTS-AND-VALIDATION-CONTRACTS.md
 *
 * Updates SourceItem status (triage action).
 * Required: status
 * Optional: notes (triage reasoning)
 * Behavior: updates status, logs SOURCE_TRIAGED event
 *
 * Per DB-ARCHITECTURE-PLAN.md: Setting status=archived sets archivedAt.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  successResponse,
  badRequest,
  notFound,
  serverError,
} from "@/lib/api-response";
import { logEvent } from "@/lib/events";
import {
  isValidEnum,
  VALID_SOURCE_ITEM_STATUSES,
} from "@/lib/validation";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // --- Validate required fields ---
    if (!isValidEnum(body.status, VALID_SOURCE_ITEM_STATUSES)) {
      return badRequest(
        "status is required and must be one of: " +
          VALID_SOURCE_ITEM_STATUSES.join(", ")
      );
    }

    // --- Check item exists ---
    const existing = await prisma.sourceItem.findUnique({ where: { id } });
    if (!existing) {
      return notFound(`SourceItem ${id} not found`);
    }

    // --- Build update data ---
    const updateData: Record<string, unknown> = {
      status: body.status,
    };

    // Per DB-ARCHITECTURE-PLAN.md: archiving sets archivedAt
    if (body.status === "archived") {
      updateData.archivedAt = new Date();
    }

    // Append triage notes if provided
    if (body.notes) {
      // Append to existing notes rather than overwriting
      const existingNotes = existing.notes || "";
      const triageNote = `\n\n[Triage ${new Date().toISOString()}]: ${body.notes}`;
      updateData.notes = existingNotes + triageNote;
    }

    const updated = await prisma.sourceItem.update({
      where: { id },
      data: updateData,
    });

    // --- Log SOURCE_TRIAGED event ---
    await logEvent({
      eventType: "SOURCE_TRIAGED",
      entityType: "sourceItem",
      entityId: id,
      actor: "human",
      details: {
        previousStatus: existing.status,
        newStatus: body.status,
        ...(body.notes ? { notes: body.notes } : {}),
      },
    });

    return successResponse({
      id: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("PUT /api/source-items/[id]/status error:", error);
    return serverError();
  }
}
