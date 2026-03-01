/**
 * POST /api/seo/keyword-targets — Create a KeywordTarget
 *
 * Per SIL-1-OBSERVATION-LEDGER.md and SIL-1-INGEST-DISCIPLINE.md:
 * - Governance record (mutable, but this endpoint is create-only)
 * - Unique on (projectId, query, locale, device)
 * - Query normalized at API boundary
 * - 409 on duplicate (governance record, not idempotent replay)
 * - EventLog emitted in same transaction
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createdResponse,
  badRequest,
  conflict,
  serverError,
} from "@/lib/api-response";
import { resolveProjectId } from "@/lib/project";
import { normalizeQuery } from "@/lib/validation";
import { CreateKeywordTargetSchema } from "@/lib/schemas/keyword-target";
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

    const parsed = CreateKeywordTargetSchema.safeParse(body);
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

    // Transactional create + event log
    try {
      const target = await prisma.$transaction(async (tx) => {
        const created = await tx.keywordTarget.create({
          data: {
            projectId,
            query: normalizedQuery,
            locale: data.locale,
            device: data.device,
            isPrimary: data.isPrimary ?? false,
            intent: data.intent ?? null,
            notes: data.notes ?? null,
          },
        });

        await tx.eventLog.create({
          data: {
            eventType: "KEYWORD_TARGET_CREATED",
            entityType: "keywordTarget",
            entityId: created.id,
            actor: "human",
            projectId,
            details: {
              query: normalizedQuery,
              locale: data.locale,
              device: data.device,
            },
          },
        });

        return created;
      });

      return createdResponse({
        id: target.id,
        query: target.query,
        locale: target.locale,
        device: target.device,
        isPrimary: target.isPrimary,
        intent: target.intent,
        notes: target.notes,
        createdAt: target.createdAt.toISOString(),
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return conflict(
          "KeywordTarget already exists for this query/locale/device"
        );
      }
      throw err;
    }
  } catch (error) {
    console.error("POST /api/seo/keyword-targets error:", error);
    return serverError();
  }
}
