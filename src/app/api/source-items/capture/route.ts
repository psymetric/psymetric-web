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
  conflict,
  serverError,
} from "@/lib/api-response";
import {
  isValidEnum,
  isValidUrl,
  isNonEmptyString,
  generateContentHash,
  VALID_SOURCE_TYPES,
  VALID_PLATFORMS,
} from "@/lib/validation";
import { resolveProjectId } from "@/lib/project";

export async function POST(request: NextRequest) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) {
      return badRequest(error);
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
    if (!isValidEnum(b.sourceType, VALID_SOURCE_TYPES)) {
      return badRequest(
        "sourceType is required and must be one of: " +
          VALID_SOURCE_TYPES.join(", ")
      );
    }

    if (!isValidUrl(b.url)) {
      return badRequest("url is required and must be a valid URL");
    }

    if (!isNonEmptyString(b.operatorIntent)) {
      return badRequest(
        "operatorIntent is required — explain why this was captured"
      );
    }

    // --- Validate optional fields ---
    if (b.platform && !isValidEnum(b.platform, VALID_PLATFORMS)) {
      return badRequest(
        "platform must be one of: " + VALID_PLATFORMS.join(", ")
      );
    }

    // --- Check for existing SourceItem with this URL ---
    // NOTE: SourceItem.url is globally unique in the schema. Enforce project isolation explicitly.
    const existing = await prisma.sourceItem.findUnique({
      where: { url: b.url as string },
    });

    if (existing) {
      // If the URL exists but belongs to another project, do not mutate across projects.
      if (existing.projectId !== projectId) {
        // Preserve global uniqueness invariant without leaking cross-project existence
        return conflict("URL already exists");
      }

      // --- Recapture: URL already exists --- (transactional)
      await prisma.$transaction(async (tx) => {
        if (b.notes) {
          const existingNotes = existing.notes || "";
          const recaptureNote = `\n\n[Recapture ${new Date().toISOString()}]: ${b.notes}`;
          await tx.sourceItem.update({
            where: { id: existing.id },
            data: { notes: existingNotes + recaptureNote },
          });
        }

        await tx.eventLog.create({
          data: {
            eventType: "SOURCE_CAPTURED",
            entityType: "sourceItem",
            entityId: existing.id,
            actor: "human",
            projectId,
            details: {
              recapture: true,
              sourceType: b.sourceType,
              url: b.url,
              operatorIntent: b.operatorIntent,
              ...(b.notes ? { notes: b.notes } : {}),
            },
          },
        });
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

    // --- New capture: URL does not exist --- (transactional)
    const contentHash = await generateContentHash(b.url as string);

    const sourceItem = await prisma.$transaction(async (tx) => {
      const item = await tx.sourceItem.create({
        data: {
          sourceType: b.sourceType as string,
          platform: (b.platform as string) || "other",
          url: b.url as string,
          capturedBy: "human",
          contentHash,
          operatorIntent: b.operatorIntent as string,
          notes: (b.notes as string) || null,
          status: "ingested",
          projectId,
        },
      });

      await tx.eventLog.create({
        data: {
          eventType: "SOURCE_CAPTURED",
          entityType: "sourceItem",
          entityId: item.id,
          actor: "human",
          projectId,
          details: {
            sourceType: item.sourceType,
            url: item.url,
            operatorIntent: b.operatorIntent,
          },
        },
      });

      return item;
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
