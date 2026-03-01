/**
 * POST /api/seo/serp-snapshot — W5 operator-triggered SERP ingest
 *
 * Per SIL-1-OBSERVATION-LEDGER.md and SIL-1-INGEST-DISCIPLINE.md:
 * - Operator-triggered only (no automation)
 * - Confirm gate: confirm=false returns cost estimate without writing
 * - confirm=true writes SERPSnapshot + EventLog in same transaction
 * - Query normalized at API boundary (normalizeQuery)
 * - capturedAt and validAt are server-assigned (now())
 * - rawPayload is a simulated provider response (no external API call)
 * - source is fixed to "dataforseo" (matches allowlist)
 * - Idempotency: P2002 on (projectId, query, locale, device, capturedAt) -> 200, no EventLog
 *
 * Hard constraints:
 * - No schema changes
 * - No real provider integration
 * - No list/update/delete
 * - Mutation and EventLog co-located in prisma.$transaction()
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createdResponse,
  successResponse,
  badRequest,
  serverError,
} from "@/lib/api-response";
import { resolveProjectId } from "@/lib/project";
import { normalizeQuery } from "@/lib/validation";
import { SERPSnapshotIngestSchema } from "@/lib/schemas/serp-snapshot-ingest";
import { Prisma } from "@prisma/client";

// Fixed mock cost per ingest task (DataForSEO standard queue unit price).
// Replace with real cost computation when provider integration is wired.
const MOCK_ESTIMATED_COST = 0.001;

// Simulated provider response -- no external API call.
// Shape matches the DataForSEO SERP Advanced endpoint structure.
// Replace with real provider call when integration is wired.
function buildMockRawPayload(
  query: string,
  locale: string,
  device: string
): Prisma.InputJsonValue {
  return {
    provider: "mock",
    query,
    locale,
    device,
    results: [],
    ai_overview: null,
  } as Prisma.InputJsonValue;
}

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

    const parsed = SERPSnapshotIngestSchema.safeParse(body);
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

    const data = parsed.data;

    // ==========================================================================
    // Dry-run path: confirm=false -- return cost estimate, do NOT write
    // ==========================================================================
    if (!data.confirm) {
      return successResponse({
        confirm_required: true,
        estimated_cost: MOCK_ESTIMATED_COST,
      });
    }

    // ==========================================================================
    // Confirmed write path: confirm=true
    // ==========================================================================

    const normalizedQuery = normalizeQuery(data.query);

    // Server-assigns both timestamps (operator-triggered, not backfill).
    const capturedAt = new Date();
    const validAt = capturedAt; // fallback rule: validAt = capturedAt when provider omits it

    const rawPayload = buildMockRawPayload(normalizedQuery, data.locale, data.device);

    try {
      const snapshot = await prisma.$transaction(async (tx) => {
        const created = await tx.sERPSnapshot.create({
          data: {
            projectId,
            query: normalizedQuery,
            locale: data.locale,
            device: data.device,
            capturedAt,
            validAt,
            rawPayload,
            payloadSchemaVersion: null,
            aiOverviewStatus: "absent",
            aiOverviewText: null,
            source: "dataforseo",
            batchRef: null,
          },
        });

        await tx.eventLog.create({
          data: {
            eventType: "SERP_SNAPSHOT_RECORDED",
            entityType: "serpSnapshot",
            entityId: created.id,
            actor: "human",
            projectId,
            details: {
              query: normalizedQuery,
              locale: data.locale,
              device: data.device,
              source: "dataforseo",
            },
          },
        });

        return created;
      });

      return createdResponse({
        id: snapshot.id,
        query: snapshot.query,
        locale: snapshot.locale,
        device: snapshot.device,
        capturedAt: snapshot.capturedAt.toISOString(),
        validAt: snapshot.validAt?.toISOString() ?? null,
        aiOverviewStatus: snapshot.aiOverviewStatus,
        source: snapshot.source,
        batchRef: snapshot.batchRef,
        createdAt: snapshot.createdAt.toISOString(),
      });
    } catch (err) {
      // Idempotent replay: unique constraint on (projectId, query, locale, device, capturedAt).
      // Because capturedAt is server-assigned to now(), a collision within the same second
      // is the only realistic replay path (e.g. double-submit). No EventLog on replay.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const existing = await prisma.sERPSnapshot.findUnique({
          where: {
            projectId_query_locale_device_capturedAt: {
              projectId,
              query: normalizedQuery,
              locale: data.locale,
              device: data.device,
              capturedAt,
            },
          },
        });

        if (existing) {
          return successResponse({
            id: existing.id,
            query: existing.query,
            locale: existing.locale,
            device: existing.device,
            capturedAt: existing.capturedAt.toISOString(),
            validAt: existing.validAt?.toISOString() ?? null,
            aiOverviewStatus: existing.aiOverviewStatus,
            source: existing.source,
            batchRef: existing.batchRef,
            createdAt: existing.createdAt.toISOString(),
          });
        }

        // Constraint fired but lookup found nothing -- race condition or partial state.
        return serverError();
      }

      throw err;
    }
  } catch (err) {
    console.error("POST /api/seo/serp-snapshot error:", err);
    return serverError();
  }
}
