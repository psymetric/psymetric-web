/**
 * POST /api/seo/serp-snapshot — W5 operator-triggered SERP ingest
 *
 * Per SIL-1-OBSERVATION-LEDGER.md and SIL-1-INGEST-DISCIPLINE.md:
 * - Operator-triggered only (no automation)
 * - Confirm gate: confirm=false returns cost estimate without writing
 * - confirm=true calls DataForSEO, normalizes result, writes SERPSnapshot + EventLog
 * - Query normalized at API boundary (normalizeQuery)
 * - capturedAt is server-assigned (now())
 * - validAt uses provider datetime if present, else capturedAt
 * - rawPayload stores the full provider response (no truncation)
 * - source is fixed to "dataforseo"
 * - Locale "en-US" only: other locales return 400 before the provider is called
 * - Provider response shape is validated (tasks[0].result[0].items) before write
 * - Idempotency: P2002 on (projectId, query, locale, device, capturedAt) -> 200, no EventLog
 *
 * Hard constraints:
 * - No schema changes
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
import { formatZodErrors } from "@/lib/zod-helpers";
import { Prisma } from "@prisma/client";
import {
  fetchSerpSnapshot,
  DataForSeoError,
} from "@/lib/integrations/dataforseo/client";
import { normalizeDataForSeoSerp } from "@/lib/integrations/dataforseo/normalize-serp";

// Fixed cost per ingest task (DataForSEO live/advanced unit price).
const ESTIMATED_COST_USD = 0.0012;

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
      return badRequest("Validation failed", formatZodErrors(parsed.error));
    }

    const data = parsed.data;

    // ==========================================================================
    // Dry-run path: confirm=false -- return cost estimate, do NOT write
    // ==========================================================================
    if (!data.confirm) {
      return successResponse({
        confirm_required: true,
        estimated_cost: ESTIMATED_COST_USD,
      });
    }

    // ==========================================================================
    // Confirmed write path: confirm=true
    // ==========================================================================

    const normalizedQuery = normalizeQuery(data.query);

    // capturedAt is server-assigned once and used for idempotency key
    const capturedAt = new Date();

    // -- Call DataForSEO provider --------------------------------------------
    let providerResponse: unknown;
    try {
      providerResponse = await fetchSerpSnapshot({
        query: normalizedQuery,
        locale: data.locale,
        device: data.device,
      });
    } catch (err) {
      if (err instanceof DataForSeoError) {
        // Locale validation failures are client errors (400), not provider errors.
        const isLocaleError = err.message.startsWith("Unsupported locale");
        return Response.json(
          isLocaleError
            ? { error: "invalid_locale", message: err.message }
            : {
                error: "provider_error",
                provider: "dataforseo",
                message: err.providerMessage ?? err.message,
              },
          { status: isLocaleError ? 400 : 502 }
        );
      }
      throw err;
    }

    // -- Validate provider response shape before normalizing or writing -------
    // Avoids writing a broken/empty snapshot when DataForSEO returns an
    // unexpected envelope (e.g. quota exhausted, partial response).
    {
      const r = providerResponse as Record<string, unknown>;
      const tasks = r?.tasks;
      const validShape =
        Array.isArray(tasks) &&
        tasks.length > 0 &&
        Array.isArray((tasks[0] as Record<string, unknown>)?.result) &&
        ((tasks[0] as Record<string, unknown>).result as unknown[]).length > 0 &&
        Array.isArray(
          (((tasks[0] as Record<string, unknown>).result as unknown[])[0] as Record<string, unknown>)?.items
        );

      if (!validShape) {
        return Response.json(
          {
            error: "provider_error",
            provider: "dataforseo",
            message:
              "Provider response missing expected shape: tasks[0].result[0].items",
          },
          { status: 502 }
        );
      }
    }

    // -- Normalize provider response -----------------------------------------
    const normalized = normalizeDataForSeoSerp(providerResponse);

    // validAt: use provider datetime if present, else fall back to capturedAt
    const validAt = normalized.validAt ? new Date(normalized.validAt) : capturedAt;

    const rawPayload = normalized.rawPayload as Prisma.InputJsonValue;

    // -- Write snapshot + event log atomically --------------------------------
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
            aiOverviewStatus: normalized.aiOverviewStatus,
            aiOverviewText: normalized.aiOverviewText,
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
              organicResultCount: normalized.organicResults.length,
              aiOverviewPresent: normalized.aiOverviewPresent,
              features: normalized.features,
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
        organicResultCount: normalized.organicResults.length,
        topDomains: normalized.topDomains,
        aiOverviewPresent: normalized.aiOverviewPresent,
        features: normalized.features,
        createdAt: snapshot.createdAt.toISOString(),
      });
    } catch (err) {
      // Idempotent replay: unique constraint on (projectId, query, locale, device, capturedAt).
      // capturedAt is server-assigned to now(), so collision within the same millisecond
      // is the only realistic replay path (double-submit). No EventLog on replay.
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
