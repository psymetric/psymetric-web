/**
 * POST /api/seo/keyword-targets — Create a KeywordTarget
 * GET  /api/seo/keyword-targets — List KeywordTargets
 *
 * Per SIL-1-OBSERVATION-LEDGER.md and SIL-1-INGEST-DISCIPLINE.md:
 * - Governance record (mutable, but create endpoint is append-only)
 * - Unique on (projectId, query, locale, device)
 * - Query normalized at API boundary
 * - 409 on duplicate (governance record, not idempotent replay)
 * - EventLog emitted in same transaction (POST only)
 *
 * GET constraints:
 * - Project-scoped (resolveProjectId)
 * - Deterministic ordering: createdAt desc, id desc
 * - Strict query param validation
 * - No write behavior
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createdResponse,
  listResponse,
  badRequest,
  conflict,
  serverError,
  parsePagination,
} from "@/lib/api-response";
import { resolveProjectId } from "@/lib/project";
import { normalizeQuery } from "@/lib/validation";
import { CreateKeywordTargetSchema } from "@/lib/schemas/keyword-target";
import { Prisma } from "@prisma/client";

// Allowed device values — enforced at API boundary (DB stores string)
const ALLOWED_DEVICES = ["desktop", "mobile"] as const;
type Device = (typeof ALLOWED_DEVICES)[number];

// =============================================================================
// GET /api/seo/keyword-targets
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) {
      return badRequest(error);
    }

    const searchParams = request.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(searchParams);

    // Always project-scoped
    const where: Prisma.KeywordTargetWhereInput = { projectId };

    // locale filter (optional, string)
    const localeParam = searchParams.get("locale");
    if (localeParam !== null) {
      if (localeParam.trim() === "") {
        return badRequest("locale must not be empty");
      }
      where.locale = localeParam;
    }

    // device filter (optional, enum-restricted)
    const deviceParam = searchParams.get("device");
    if (deviceParam !== null) {
      if (!(ALLOWED_DEVICES as readonly string[]).includes(deviceParam)) {
        return badRequest(`device must be one of: ${ALLOWED_DEVICES.join(", ")}`);
      }
      where.device = deviceParam as Device;
    }

    // isPrimary filter (optional, strict true/false only)
    const isPrimaryParam = searchParams.get("isPrimary");
    if (isPrimaryParam !== null) {
      if (isPrimaryParam !== "true" && isPrimaryParam !== "false") {
        return badRequest('isPrimary must be "true" or "false"');
      }
      where.isPrimary = isPrimaryParam === "true";
    }

    const [rows, total] = await Promise.all([
      prisma.keywordTarget.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
        select: {
          id: true,
          query: true,
          locale: true,
          device: true,
          isPrimary: true,
          intent: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.keywordTarget.count({ where }),
    ]);

    const items = rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    return listResponse(items, { page, limit, total });
  } catch (err) {
    console.error("GET /api/seo/keyword-targets error:", err);
    return serverError();
  }
}

// =============================================================================
// POST /api/seo/keyword-targets
// =============================================================================

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
    const normalizedQueryStr = normalizeQuery(data.query);

    // Transactional create + event log
    try {
      const target = await prisma.$transaction(async (tx) => {
        const created = await tx.keywordTarget.create({
          data: {
            projectId,
            query: normalizedQueryStr,
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
              query: normalizedQueryStr,
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
        updatedAt: target.updatedAt.toISOString(),
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
