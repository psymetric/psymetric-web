/**
 * POST /api/source-items/capture
 * Per docs/operations-planning-api/01-API-ENDPOINTS-AND-VALIDATION-CONTRACTS.md
 *
 * Creates a new SourceItem, or handles recapture if URL already exists.
 * Required: sourceType, url, operatorIntent
 * Optional: platform, notes
 *
 * New capture: status=ingested, generates contentHash, logs SOURCE_CAPTURED → 201
 * Recapture: logs SOURCE_CAPTURED with recapture=true, appends notes → 200
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createdResponse,
  successResponse,
  badRequest,
  serverError,
} from "@/lib/api-response";
import { logEvent } from "@/lib/events";
import {
  isValidEnum,
  isValidUrl,
  isNonEmptyString,
  generateContentHash,
  VALID_SOURCE_TYPES,
  VALID_PLATFORMS,
} from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // --- Validate required fields ---
    if (!isValidEnum(body.sourceType, VALID_SOURCE_TYPES)) {
      return badRequest(
        "sourceType is required and must be one of: " +
          VALID_SOURCE_TYPES.join(", ")
      );
    }

    if (!isValidUrl(body.url)) {
      return badRequest("url is required and must be a valid URL");
    }

    if (!isNonEmptyString(body.operatorIntent)) {
      return badRequest(
        "operatorIntent is required — explain why this was captured"
      );
    }

    // --- Validate optional fields ---
    if (body.platform && !isValidEnum(body.platform, VALID_PLATFORMS)) {
      return badRequest(
        "platform must be one of: " + VALID_PLATFORMS.join(", ")
      );
    }

    // --- Check for existing SourceItem with this URL ---
    const existing = await prisma.sourceItem.findUnique({
      where: { url: body.url },
    });

    if (existing) {
      // --- Recapture: URL already exists ---

      // Append notes if provided (same pattern as triage route)
      if (body.notes) {
        const existingNotes = existing.notes || "";
        const recaptureNote = `\n\n[Recapture ${new Date().toISOString()}]: ${body.notes}`;
        await prisma.sourceItem.update({
          where: { id: existing.id },
          data: { notes: existingNotes + recaptureNote },
        });
      }

      // Log SOURCE_CAPTURED with recapture flag
      await logEvent({
        eventType: "SOURCE_CAPTURED",
        entityType: "sourceItem",
        entityId: existing.id,
        actor: "human",
        details: {
          recapture: true,
          sourceType: body.sourceType,
          url: body.url,
          operatorIntent: body.operatorIntent,
          ...(body.notes ? { notes: body.notes } : {}),
        },
      });

      return successResponse({
        id: existing.id,
        sourceType: existing.sourceType,
        url: existing.url,
        status: existing.status,
        capturedAt: existing.capturedAt.toISOString(),
        createdAt: existing.createdAt.toISOString(),
      });
    }

    // --- New capture: URL does not exist ---
    const contentHash = await generateContentHash(body.url);

    const sourceItem = await prisma.sourceItem.create({
      data: {
        sourceType: body.sourceType,
        platform: body.platform || "other",
        url: body.url,
        capturedBy: "human",
        contentHash,
        operatorIntent: body.operatorIntent,
        notes: body.notes || null,
        status: "ingested",
      },
    });

    await logEvent({
      eventType: "SOURCE_CAPTURED",
      entityType: "sourceItem",
      entityId: sourceItem.id,
      actor: "human",
      details: {
        sourceType: sourceItem.sourceType,
        url: sourceItem.url,
        operatorIntent: body.operatorIntent,
      },
    });

    return createdResponse({
      id: sourceItem.id,
      sourceType: sourceItem.sourceType,
      url: sourceItem.url,
      status: sourceItem.status,
      capturedAt: sourceItem.capturedAt.toISOString(),
      createdAt: sourceItem.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("POST /api/source-items/capture error:", error);
    return serverError();
  }
}
