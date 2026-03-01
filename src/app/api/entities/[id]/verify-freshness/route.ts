/**
 * POST /api/entities/[id]/verify-freshness
 *
 * Operator action: record that entity content has been verified as fresh.
 * Updates Entity.lastVerifiedAt inside prisma.$transaction() with EventLog.
 *
 * Hard constraints:
 * - Project scoping via resolveProjectId() — 404 non-disclosure cross-project
 * - No schema changes
 * - Mutation and EventLog co-located in prisma.$transaction()
 * - actor: "human" (operator-triggered)
 * - EventType: ENTITY_UPDATED (canonical; no freshness-specific type exists)
 *
 * Body (optional):
 * - verifiedAt: ISO 8601 datetime with TZ — if omitted, server uses now()
 *
 * Response: 200 successResponse with updated entity
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  successResponse,
  badRequest,
  notFound,
  serverError,
} from "@/lib/api-response";
import { resolveProjectId } from "@/lib/project";
import { VerifyFreshnessSchema } from "@/lib/schemas/verify-freshness";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

    if (!UUID_RE.test(id)) {
      return badRequest("id must be a valid UUID");
    }

    // Fetch before parsing body to fail fast on missing entity.
    const existing = await prisma.entity.findUnique({
      where: { id },
      select: { id: true, projectId: true, entityType: true },
    });

    if (!existing || existing.projectId !== projectId) {
      return notFound("Entity not found");
    }

    // Parse body — empty body is valid (verifiedAt is optional).
    let body: unknown = {};
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        const text = await request.text();
        if (text.trim().length > 0) {
          body = JSON.parse(text);
        }
      } catch {
        return badRequest("Invalid JSON body");
      }
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return badRequest("Request body must be an object");
    }

    const parsed = VerifyFreshnessSchema.safeParse(body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      return badRequest("Validation failed", [
        ...flat.formErrors.map((msg) => ({
          code: "VALIDATION_ERROR" as const,
          message: msg,
        })),
        ...Object.entries(flat.fieldErrors).flatMap(([field, messages]) =>
          (messages ?? []).map((msg) => ({
            code: "VALIDATION_ERROR" as const,
            field,
            message: msg,
          }))
        ),
      ]);
    }

    const verifiedAt = parsed.data.verifiedAt
      ? new Date(parsed.data.verifiedAt)
      : new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const entity = await tx.entity.update({
        where: { id },
        data: { lastVerifiedAt: verifiedAt },
      });

      await tx.eventLog.create({
        data: {
          eventType: "ENTITY_UPDATED",
          entityType: existing.entityType,
          entityId: entity.id,
          actor: "human",
          projectId,
          details: {
            updatedFields: ["lastVerifiedAt"],
            lastVerifiedAt: verifiedAt.toISOString(),
          },
        },
      });

      return entity;
    });

    return successResponse(updated);
  } catch (err) {
    console.error("POST /api/entities/[id]/verify-freshness error:", err);
    return serverError();
  }
}
