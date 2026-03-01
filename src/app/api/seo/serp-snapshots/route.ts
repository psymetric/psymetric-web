/**
 * POST /api/seo/serp-snapshots — Record a SERPSnapshot
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
import { RecordSERPSnapshotSchema } from "@/lib/schemas/serp-snapshot";
import { Prisma } from "@prisma/client";

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

    const parsed = RecordSERPSnapshotSchema.safeParse(body);
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
    const normalizedQuery = normalizeQuery(data.query);

    const capturedAt = data.capturedAt ? new Date(data.capturedAt) : new Date();
    const validAt = data.validAt ? new Date(data.validAt) : capturedAt;

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
            rawPayload: data.rawPayload as Prisma.InputJsonValue,
            payloadSchemaVersion: data.payloadSchemaVersion ?? null,
            aiOverviewStatus: data.aiOverviewStatus ?? "unknown",
            aiOverviewText: data.aiOverviewText ?? null,
            source: data.source,
            batchRef: data.batchRef ?? null,
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
              source: data.source,
              ...(data.batchRef ? { batchRef: data.batchRef } : {}),
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

        return serverError();
      }
      throw err;
    }
  } catch (error) {
    console.error("POST /api/seo/serp-snapshots error:", error);
    return serverError();
  }
}
