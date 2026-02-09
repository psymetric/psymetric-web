/**
 * POST /api/source-items/capture
 * Per docs/operations-planning-api/01-API-ENDPOINTS-AND-VALIDATION-CONTRACTS.md
 *
 * Creates a new SourceItem.
 * Required: sourceType, url, operatorIntent
 * Optional: platform, notes
 * Behavior: status=ingested, generates contentHash, logs SOURCE_CAPTURED
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createdResponse, badRequest, serverError } from "@/lib/api-response";
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
      return badRequest("sourceType is required and must be one of: " + VALID_SOURCE_TYPES.join(", "));
    }

    if (!isValidUrl(body.url)) {
      return badRequest("url is required and must be a valid URL");
    }

    // Per API contract: "Rejects requests missing operatorIntent"
    if (!isNonEmptyString(body.operatorIntent)) {
      return badRequest("operatorIntent is required — explain why this was captured");
    }

    // --- Validate optional fields ---
    if (body.platform && !isValidEnum(body.platform, VALID_PLATFORMS)) {
      return badRequest("platform must be one of: " + VALID_PLATFORMS.join(", "));
    }

    // --- Generate contentHash from URL ---
    const contentHash = await generateContentHash(body.url);

    // --- Create SourceItem ---
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

    // --- Log SOURCE_CAPTURED event ---
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
