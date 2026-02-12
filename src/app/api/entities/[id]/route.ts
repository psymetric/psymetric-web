/**
 * PATCH /api/entities/[id] — Update allowlisted editorial fields only
 *
 * Phase 1 deterministic update endpoint
 * - Updates only allowlisted fields: title, summary, contentRef, canonicalUrl
 * - No lifecycle transitions, no status changes, no publish logic
 * - Strict validation and logging
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
import { isNonEmptyString } from "@/lib/validation";

// Strict allowlist of updateable fields
const ALLOWED_FIELDS = ["title", "summary", "contentRef", "canonicalUrl"] as const;
type AllowedField = (typeof ALLOWED_FIELDS)[number];

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id || typeof id !== "string") {
      return badRequest("Invalid id parameter");
    }

    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!UUID_RE.test(id)) {
      return badRequest("id must be a valid UUID");
    }

    // Parse request body safely
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    if (typeof body !== "object" || body === null) {
      return badRequest("Invalid JSON body");
    }

    const requestFields = body as Record<string, unknown>;

    // Validate allowlist - check for any non-allowed fields
    const providedFields = Object.keys(requestFields);
    const invalidFields = providedFields.filter(
      (field) => !ALLOWED_FIELDS.includes(field as AllowedField)
    );

    if (invalidFields.length > 0) {
      return badRequest("Invalid update fields");
    }

    // Must include at least one allowed field
    if (providedFields.length === 0) {
      return badRequest("Must provide at least one field to update");
    }

    // Validate individual fields
    const data: Record<string, string | null> = {};

    if (requestFields.title !== undefined) {
      if (typeof requestFields.title !== "string" || !isNonEmptyString(requestFields.title)) {
        return badRequest("title must be a non-empty string");
      }
      data.title = requestFields.title;
    }

    if (requestFields.summary !== undefined) {
      if (typeof requestFields.summary !== "string") {
        return badRequest("summary must be a string");
      }
      data.summary = requestFields.summary;
    }

    if (requestFields.contentRef !== undefined) {
      if (typeof requestFields.contentRef !== "string" || !isNonEmptyString(requestFields.contentRef)) {
        return badRequest("contentRef must be a non-empty string");
      }
      data.contentRef = requestFields.contentRef;
    }

    if (requestFields.canonicalUrl !== undefined) {
      if (typeof requestFields.canonicalUrl !== "string" || !requestFields.canonicalUrl.startsWith("/")) {
        return badRequest("canonicalUrl must be a string starting with '/'");
      }
      data.canonicalUrl = requestFields.canonicalUrl;
    }

    // Check if entity exists and update
    const updatedEntity = await prisma.entity.update({
      where: { id },
      data,
    });

    // Log update event
    await logEvent({
      eventType: "ENTITY_UPDATED",
      entityType: updatedEntity.entityType as "guide" | "concept" | "project" | "news",
      entityId: updatedEntity.id,
      actor: "human",
      details: {
        updatedFields: Object.keys(data),
      },
    });

    return successResponse(updatedEntity);
  } catch (error) {
    // Handle Prisma not found error
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return notFound("Entity not found");
    }

    console.error("PATCH /api/entities/[id] error:", error);
    return serverError();
  }
}
