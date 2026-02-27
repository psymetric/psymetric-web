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
import type { Prisma, SourceItemStatus } from "@prisma/client";
import {
  successResponse,
  badRequest,
  notFound,
  serverError,
} from "@/lib/api-response";
import { isValidEnum, VALID_SOURCE_ITEM_STATUSES } from "@/lib/validation";
import { resolveProjectId } from "@/lib/project";

// UUID validation regex
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) {
      return badRequest(error);
    }

    const { id } = await params;
    if (!id || !UUID_RE.test(id)) {
      return badRequest("id must be a valid UUID");
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return badRequest("Request body must be an object");
    }

    const b = body as Record<string, unknown>;

    // --- Validate required fields ---
    if (!isValidEnum(b.status, VALID_SOURCE_ITEM_STATUSES)) {
      return badRequest(
        "status is required and must be one of: " +
          VALID_SOURCE_ITEM_STATUSES.join(", ")
      );
    }

    // Runtime validation above guarantees this cast is safe.
    const newStatus = b.status as SourceItemStatus;

    // Notes must be string if provided
    if (b.notes !== undefined && b.notes !== null && typeof b.notes !== "string") {
      return badRequest("notes must be a string");
    }

    // --- Check item exists and belongs to project ---
    const existing = await prisma.sourceItem.findUnique({
      where: { id },
      select: { id: true, status: true, notes: true, projectId: true },
    });

    if (!existing || existing.projectId !== projectId) {
      return notFound(`SourceItem ${id} not found`);
    }

    // --- Build update data ---
    // Prisma expects enum-typed status; runtime validation above guarantees the cast is safe.
    const updateData: Prisma.SourceItemUpdateInput = {
      status: newStatus,
    };

    // Per DB-ARCHITECTURE-PLAN.md: archiving sets archivedAt
    if (newStatus === "archived") {
      updateData.archivedAt = new Date();
    }

    // Append triage notes if provided
    if (typeof b.notes === "string" && (b.notes as string).length > 0) {
      const existingNotes = existing.notes || "";
      const triageNote = `\n\n[Triage ${new Date().toISOString()}]: ${b.notes}`;
      updateData.notes = existingNotes + triageNote;
    }

    // Transactional status update + event log (atomic)
    const updated = await prisma.$transaction(async (tx) => {
      const item = await tx.sourceItem.update({
        where: { id },
        data: updateData,
      });

      await tx.eventLog.create({
        data: {
          eventType: "SOURCE_TRIAGED",
          entityType: "sourceItem",
          entityId: id,
          actor: "human",
          projectId,
          details: {
            previousStatus: existing.status,
            newStatus,
            ...(typeof b.notes === "string" && (b.notes as string).length > 0
              ? { notes: b.notes }
              : {}),
          },
        },
      });

      return item;
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
